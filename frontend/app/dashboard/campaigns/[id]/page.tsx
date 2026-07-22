'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Upload, Plus, Trash2, Loader2, PhoneCall, Pencil, Check, X, Users, Pause, Square } from 'lucide-react';
import Header from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { parseContactsCsv } from '@/lib/contacts';

const OUTCOME_STYLE: Record<string, string> = {
  Interested: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
  'Not Interested': 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/10',
  Callback: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10',
  'No Answer': 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5',
  Completed: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5',
  draft: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5',
  calling: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10',
  running: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
  retry: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10',
  paused: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10',
  called: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
  completed: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
  exhausted: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5',
  failed: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/10',
};

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [cr, ctr, lr] = await Promise.all([
      fetch('/api/campaigns'),
      fetch(`/api/campaigns/${id}/contacts`),
      fetch('/api/calls'),
    ]);
    if (cr.ok) { const list = await cr.json(); const c = list.find((x: any) => x.id === id); setCampaign(c); setNameDraft(c?.name || ''); }
    if (ctr.ok) setContacts(await ctr.json());
    if (lr.ok) { const all = await lr.json(); setCalls(all.filter((c: any) => c.campaignId === id)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // While a campaign is running, refresh progress and nudge the server-side
  // runner. The campaign keeps dialling without this — a scheduler hitting
  // /api/campaigns/tick drives it in production; this only makes an open
  // dashboard feel live.
  useEffect(() => {
    if (campaign?.status !== 'running') return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      await fetch('/api/campaigns/tick', { method: 'POST' }).catch(() => {});
      if (!cancelled) await load();
    }, 5000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [campaign?.status, load]);

  const addContacts = async (rows: { name: string; phone: string }[]) => {
    if (!rows.length) { toast.error('No valid contacts'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${id}/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts: rows }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`Added ${d.added} contacts`); await load(); } else toast.error(d.error || 'Failed to add');
    } finally { setBusy(false); }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) { toast.error('Upload a .csv file with a phone column'); return; }
    const text = await f.text();
    const p = parseContactsCsv(text);
    await addContacts(p.contacts);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addOne = async () => {
    if (!newPhone.trim()) { toast.error('Enter a phone number'); return; }
    await addContacts([{ name: newName.trim(), phone: newPhone.trim() }]);
    setNewName(''); setNewPhone('');
  };

  const removeContact = async (contactId: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
    await fetch(`/api/campaigns/${id}/contacts?contactId=${contactId}`, { method: 'DELETE' });
    load();
  };

  const clearAll = async () => {
    if (!confirm('Remove all contacts from this campaign?')) return;
    await fetch(`/api/campaigns/${id}/contacts?all=1`, { method: 'DELETE' });
    toast.success('Cleared all contacts'); load();
  };

  const saveName = async () => {
    await fetch('/api/campaigns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: nameDraft }) });
    setEditingName(false); toast.success('Renamed'); load();
  };

  // Dialling is driven by the server-side campaign runner, not a loop in the
  // browser — closing this tab no longer stops the campaign.
  const control = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        toast.error(d.error || `Could not ${action} campaign`);
      } else if (d.notice) {
        toast.warning(d.notice);
      } else if (action === 'start' || action === 'resume') {
        toast.success(`Campaign running — dialling ${d.dialled} call${d.dialled === 1 ? '' : 's'}`);
      } else {
        toast.success(`Campaign ${d.status}`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!campaign) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center text-slate-600 dark:text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const successRate = campaign.contactsCalled > 0 ? ((campaign.successCount / campaign.contactsCalled) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen pb-10">
      <Header title="Campaign" subtitle="Manage contacts, edit the list, and run the auto-dialer" />
      <div className="p-4 sm:p-6 space-y-6">

        {/* Name + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input value={nameDraft} onChange={e => setNameDraft(e.target.value)} className="h-9 w-64 bg-white dark:bg-[#0a1128] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" />
              <button onClick={saveName} className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setEditingName(false); setNameDraft(campaign.name); }} className="p-2 text-slate-600 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">{campaign.name}<button onClick={() => setEditingName(true)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><Pencil className="w-4 h-4" /></button></h2>
          )}
          <div className="flex items-center gap-2">
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium capitalize', STATUS_STYLE[campaign.status] || STATUS_STYLE.pending)}>
              {campaign.status}
            </span>
            {campaign.status === 'running' ? (
              <>
                <Button onClick={() => control('pause')} disabled={busy} variant="outline" className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Pause
                </Button>
                <Button onClick={() => control('stop')} disabled={busy} variant="ghost" className="text-red-500 hover:bg-red-500/10 gap-2">
                  <Square className="w-4 h-4" /> Stop
                </Button>
              </>
            ) : (
              <Button onClick={() => control(campaign.status === 'paused' ? 'resume' : 'start')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                {campaign.status === 'paused' ? 'Resume' : 'Start Campaign'}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Contacts', value: campaign.totalContacts },
            { label: 'Called', value: campaign.contactsCalled },
            { label: 'Successful', value: campaign.successCount },
            { label: 'Success Rate', value: `${successRate}%` },
          ].map(m => (
            <div key={m.label} className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
              <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{m.value}</div>
              <div className="text-xs text-slate-600 dark:text-slate-500">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Contact list editor */}
        <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" />Contacts <span className="text-slate-500 dark:text-slate-400">({contacts.length})</span></h3>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 gap-1.5"><Upload className="w-3.5 h-3.5" />Upload CSV</Button>
              {contacts.length > 0 && <Button size="sm" variant="ghost" onClick={clearAll} className="text-red-500 hover:bg-red-500/10 gap-1.5"><Trash2 className="w-3.5 h-3.5" />Clear</Button>}
            </div>
          </div>

          {/* Manual add row */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)" className="h-9 bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white sm:max-w-[200px]" />
            <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addOne()} placeholder="+9198…" className="h-9 bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white sm:max-w-[200px]" />
            <Button size="sm" onClick={addOne} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"><Plus className="w-3.5 h-3.5" />Add</Button>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5 sticky top-0">
                <tr>{['Name', 'Phone', 'Status', ''].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {contacts.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-600 dark:text-slate-500"><Upload className="w-8 h-8 mx-auto mb-2 text-slate-600 dark:text-slate-600" />Upload a CSV or add contacts to build your call list.</td></tr>
                ) : contacts.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] group">
                    <td className="px-5 py-3 text-slate-900 dark:text-white">{c.name || <span className="text-slate-500 dark:text-slate-400">—</span>}</td>
                    <td className="px-5 py-3 font-mono text-slate-600 dark:text-slate-300">{c.phone}</td>
                    <td className="px-5 py-3"><span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_STYLE[c.status] || STATUS_STYLE.pending)}>{c.status}</span></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => removeContact(c.id)} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Call results */}
        <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Call Results</h3></div>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
              <tr>{['Phone', 'Duration', 'Outcome', 'Cost', 'Time'].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-500 uppercase">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {calls.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-600 dark:text-slate-500">No calls yet</td></tr>
              ) : calls.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-mono text-slate-600 dark:text-slate-300">{c.phone}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{Math.floor((c.duration || 0) / 60)}:{String((c.duration || 0) % 60).padStart(2, '0')}</td>
                  <td className="px-5 py-3">{c.outcome ? <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', OUTCOME_STYLE[c.outcome] || 'text-slate-600 dark:text-slate-500 bg-slate-100 dark:bg-white/5')}>{c.outcome}</span> : '—'}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">₹{(c.cost || 0).toFixed(2)}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-500 text-xs">{new Date(c.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
