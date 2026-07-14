'use client';
import { useState, useEffect, useCallback } from 'react';
import { Phone, Search, Clock, Download, MessageCircle, Check, Sparkles, Send, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Header from '@/components/dashboard/header';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

function renderTpl(tpl: string, name: string, phone: string, company: string) {
  return (tpl || 'Hi {name}! Thanks for your interest. — {company}')
    .replace(/\{name\}/gi, name || 'there').replace(/\{phone\}/gi, phone || '').replace(/\{company\}/gi, company || 'our team');
}

// Manual WhatsApp compose dialog.
function WhatsAppModal({ target, template, company, onClose, onSent }: { target: any; template: string; company: string; onClose: () => void; onSent: () => void }) {
  const [msg, setMsg] = useState(renderTpl(template, target.customerName || '', target.phone, company));
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!msg.trim()) { toast.error('Message is empty'); return; }
    setSending(true);
    try {
      const r = await fetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: target.phone, message: msg, name: target.customerName, callId: target.id }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`WhatsApp sent to ${target.phone}`); onSent(); onClose(); }
      else toast.error(d.error || 'Could not send');
    } finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 rounded-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center"><MessageCircle className="w-5 h-5 text-emerald-500" /></div>
          <div className="flex-1"><h3 className="text-slate-900 dark:text-white font-semibold text-sm">Send WhatsApp</h3><p className="text-xs text-slate-600 dark:text-slate-500">to {target.customerName ? `${target.customerName} · ` : ''}{target.phone}</p></div>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} className="w-full rounded-md bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending} className="text-slate-600 dark:text-slate-500">Cancel</Button>
          <Button onClick={send} disabled={sending} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send</Button>
        </div>
      </div>
    </div>
  );
}

const OUTCOME_STYLE: Record<string, string> = {
  Interested: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
  'Not Interested': 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/10',
  Callback: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10',
  'No Answer': 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5',
  Voicemail: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/10',
  Completed: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10',
};

function fmtDuration(s: number) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallsPage() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [waTarget, setWaTarget] = useState<any | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/calls');
    if (r.ok) setCalls(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = calls.filter(c => {
    const matchSearch = c.phone.includes(search) || (c.customerName || '').toLowerCase().includes(search.toLowerCase()) || (c.agent?.name || '').toLowerCase().includes(search.toLowerCase()) || (c.outcome || '').toLowerCase().includes(search.toLowerCase());
    const matchOutcome = outcomeFilter === 'all' || (outcomeFilter === 'Interested' ? c.interested : c.outcome === outcomeFilter);
    return matchSearch && matchOutcome;
  });

  const interestedCount = calls.filter(c => c.interested).length;

  const markInterested = async (id: string) => {
    setMarking(id);
    try {
      const r = await fetch('/api/calls/interested', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id, interested: true }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast.success(d.whatsappSent ? 'Marked interested · WhatsApp sent ✅' : 'Marked interested (enable WhatsApp + Twilio to auto-message)');
        await load();
      } else toast.error(d.error || 'Failed');
    } finally { setMarking(null); }
  };

  // Auto-generated call sheet → CSV.
  const exportCsv = () => {
    const rows = [['Customer Name', 'Phone', 'Agent', 'Duration (s)', 'Outcome', 'Interested', 'WhatsApp Sent', 'Cost (INR)', 'Recording', 'Date']];
    for (const c of filtered) {
      rows.push([
        c.customerName || '', c.phone, c.agent?.name || '', String(c.duration || 0),
        c.outcome || '', c.interested ? 'Yes' : 'No', c.whatsappSent ? 'Yes' : 'No',
        String(c.cost || 0), c.recording || '', new Date(c.startedAt).toLocaleString(),
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `finbud-call-sheet-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Call sheet exported');
  };

  return (
    <div className="min-h-screen pb-10">
      <Header title="Call Logs & Lead Sheet" subtitle="Auto-generated sheet of every call, outcome, and interested lead" />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Calls', value: calls.length, color: 'text-slate-900 dark:text-white' },
            { label: 'Interested Leads', value: interestedCount, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'WhatsApp Sent', value: calls.filter(c => c.whatsappSent).length, color: 'text-cyan-500' },
            { label: 'Conversion', value: calls.length ? `${Math.round((interestedCount / calls.length) * 100)}%` : '0%', color: 'text-amber-600 dark:text-amber-400' },
          ].map(s => <div key={s.label} className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl p-4"><div className={cn('text-2xl font-bold', s.color)}>{s.value}</div><div className="text-xs text-slate-600 dark:text-slate-500">{s.label}</div></div>)}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-500" />
            <Input placeholder="Search name, phone, agent..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white dark:bg-[#0a1128] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" />
          </div>
          <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)} className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/50">
            <option value="all">All Outcomes</option>
            <option value="Interested">Interested only</option>
            {['Not Interested', 'Callback', 'No Answer', 'Voicemail', 'Completed'].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <Button onClick={exportCsv} variant="outline" className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 gap-2"><Download className="w-4 h-4" /> Export Sheet (CSV)</Button>
        </div>

        <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
              <tr>
                {['Customer', 'Phone', 'Agent', 'Duration', 'Outcome', 'Cost', 'Time', ''].map(h => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-medium text-slate-600 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-600 dark:text-slate-500">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center"><Phone className="w-8 h-8 text-slate-500 dark:text-slate-600 mx-auto mb-2" /><div className="text-slate-600 dark:text-slate-500 text-sm">No calls found</div></td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className={cn('hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors', c.interested && 'bg-emerald-500/[0.03]')}>
                  <td className="px-5 py-4 text-slate-900 dark:text-white">{c.customerName || <span className="text-slate-500 dark:text-slate-400">—</span>}</td>
                  <td className="px-5 py-4 font-mono text-slate-600 dark:text-slate-300">{c.phone}</td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{c.agent?.name || '—'}</td>
                  <td className="px-5 py-4"><span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />{fmtDuration(c.duration)}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      {c.outcome ? <span className={cn('px-2 py-1 rounded-full text-xs font-medium', OUTCOME_STYLE[c.outcome] || 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5')}>{c.outcome}</span> : <span className="text-slate-600 dark:text-slate-500">—</span>}
                      {c.whatsappSent && <span title="WhatsApp follow-up sent" className="text-emerald-500"><MessageCircle className="w-3.5 h-3.5" /></span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-400">₹{(c.cost || 0).toFixed(2)}</td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-500 text-xs">{new Date(c.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {c.interested ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" />Lead</span>
                      ) : (
                        <button onClick={() => markInterested(c.id)} disabled={marking === c.id} className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50">
                          <Sparkles className="w-3.5 h-3.5" />{marking === c.id ? '…' : 'Mark interested'}
                        </button>
                      )}
                      <button onClick={() => setWaTarget(c)} title="Send WhatsApp" className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400">
                        <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                      </button>
                      <a href={`/dashboard/calls/${c.id}`} className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                        Details
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {waTarget && <WhatsAppModal target={waTarget} template={user?.whatsappTemplate || ''} company={user?.company || user?.fullName || ''} onClose={() => setWaTarget(null)} onSent={load} />}
    </div>
  );
}
