'use client';
import { useState, useEffect, useCallback } from 'react';
import { Phone, Search, Clock, Download, MessageCircle, Check, Sparkles, Send, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Header from '@/components/dashboard/header';
import { cn } from '@/lib/utils';
import { MotionList, MotionItem, MotionWrapper } from '@/components/motion-wrapper';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div 
        className="w-full max-w-md bg-white/70 dark:bg-[#0f172a]/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-6 shadow-2xl relative z-10" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-slate-900 dark:text-white font-semibold">Send WhatsApp</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                to {target.customerName ? <span className="font-medium text-slate-700 dark:text-slate-300">{target.customerName}</span> : ''} {target.customerName && '·'} {target.phone}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="relative mb-5">
          <textarea 
            value={msg} 
            onChange={e => setMsg(e.target.value)} 
            rows={5} 
            className="w-full rounded-2xl bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all resize-none shadow-inner" 
            placeholder="Type your message here..."
          />
          <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-medium">
            {msg.length} chars
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={sending} className="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl">
            Cancel
          </Button>
          <Button onClick={send} disabled={sending} className="bg-emerald-500 hover:bg-emerald-400 text-white gap-2 rounded-xl px-6 shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
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

function AudioWaveform({ playing }: { playing: boolean }) {
  if (!playing) return <div className="flex items-center gap-0.5 h-3"><div className="w-0.5 h-1 bg-emerald-500/50 rounded-full"/><div className="w-0.5 h-1 bg-emerald-500/50 rounded-full"/><div className="w-0.5 h-1 bg-emerald-500/50 rounded-full"/></div>;
  return (
    <div className="flex items-center gap-0.5 h-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="waveform-bar w-0.5 h-3 bg-emerald-500 rounded-full" />
      ))}
    </div>
  );
}

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
        <MotionList className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Calls', value: calls.length, color: 'text-slate-900 dark:text-white' },
            { label: 'Interested Leads', value: interestedCount, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'WhatsApp Sent', value: calls.filter(c => c.whatsappSent).length, color: 'text-cyan-500' },
            { label: 'Conversion', value: calls.length ? `${Math.round((interestedCount / calls.length) * 100)}%` : '0%', color: 'text-amber-600 dark:text-amber-400' },
          ].map(s => <MotionItem key={s.label} className="glass-card rounded-xl p-4 transition-transform hover:-translate-y-1"><div className={cn('text-2xl font-bold', s.color)}>{s.value}</div><div className="text-xs text-slate-600 dark:text-slate-500">{s.label}</div></MotionItem>)}
        </MotionList>

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

        <MotionList className="flex flex-col gap-3 mt-6">
          {loading ? (
            <div className="py-10 text-center text-slate-600 dark:text-slate-500 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500/50" />
              Loading calls...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center glass-card rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-slate-400 dark:text-slate-600" />
              </div>
              <div className="text-slate-900 dark:text-white font-medium mb-1">No calls found</div>
              <div className="text-slate-500 dark:text-slate-400 text-sm">Try adjusting your search or filters.</div>
            </div>
          ) : filtered.map(c => (
            <MotionItem key={c.id} className={cn(
              "group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl glass-card border border-slate-200/50 dark:border-white/5 hover:border-emerald-500/30 transition-all duration-300 gap-4",
              c.interested && 'bg-emerald-50/50 dark:bg-emerald-500/[0.03] border-emerald-100 dark:border-emerald-500/10'
            )}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                  <Phone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {c.customerName || <span className="text-slate-400 dark:text-slate-500 font-normal">Unknown Name</span>}
                    </span>
                    {c.outcome && (
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider', OUTCOME_STYLE[c.outcome] || 'text-slate-500 bg-slate-100 dark:bg-white/5')}>
                        {c.outcome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{c.phone}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtDuration(c.duration)}</span>
                    <span className="hidden sm:inline">•</span>
                    <span>{new Date(c.startedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:ml-auto shrink-0 overflow-x-auto pb-1 sm:pb-0">
                {c.interested ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                    <Check className="w-3.5 h-3.5" /> High Intent Lead
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => markInterested(c.id)} disabled={marking === c.id} className="h-8 text-xs text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {marking === c.id ? '...' : 'Mark Lead'}
                  </Button>
                )}

                <div className="w-px h-6 bg-slate-200 dark:bg-white/10 hidden sm:block" />

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWaTarget(c)} className={cn("h-8 gap-1.5 text-xs transition-colors", c.whatsappSent ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10" : "text-slate-600 dark:text-slate-300")}>
                    <MessageCircle className="w-3.5 h-3.5" /> 
                    <span className="hidden sm:inline">{c.whatsappSent ? 'Sent' : 'WhatsApp'}</span>
                  </Button>
                  
                  <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#0f172a] h-8 px-2.5 rounded-md border border-slate-200 dark:border-white/10 group cursor-pointer hover:border-emerald-500/50 transition-colors shrink-0">
                    <AudioWaveform playing={false} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide group-hover:text-emerald-500 transition-colors font-medium">Listen</span>
                  </div>

                  <a href={`/dashboard/calls/${c.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                      Details
                    </Button>
                  </a>
                </div>
              </div>
            </MotionItem>
          ))}
        </MotionList>
      </div>

      {waTarget && <WhatsAppModal target={waTarget} template={user?.whatsappTemplate || ''} company={user?.company || user?.fullName || ''} onClose={() => setWaTarget(null)} onSent={load} />}
    </div>
  );
}
