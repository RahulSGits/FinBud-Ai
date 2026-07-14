'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Plus, Trash2, ToggleLeft, ToggleRight, Phone, Search, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Header from '@/components/dashboard/header';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Sandbox: chat-test an agent with no credits / no dialing.
function SandboxModal({ agent, onClose }: { agent: any; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: agent.firstMessage || 'Hello! How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true);
    try {
      const r = await fetch('/api/sandbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: agent.id, messages: next.filter(m => m.role !== 'assistant' || m !== next[0]) }) });
      const d = await r.json().catch(() => ({}));
      setMessages(m => [...m, { role: 'assistant', content: d.reply || d.error || '…' }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col h-[70vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-white/10">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Brain className="w-5 h-5 text-emerald-400" /></div>
          <div className="flex-1"><h3 className="text-slate-900 dark:text-white font-semibold text-sm">Test: {agent.name}</h3><p className="text-xs text-slate-600 dark:text-slate-500">Sandbox · no credits used</p></div>
          <button onClick={onClose} className="text-slate-600 dark:text-slate-500 hover:text-white text-sm px-2">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-bl-none')}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl rounded-bl-none px-3.5 py-2 text-sm text-slate-500 dark:text-slate-400">typing…</div></div>}
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-white/10 flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type as the caller…" className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" />
          <Button onClick={send} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [callAgent, setCallAgent] = useState<any | null>(null);
  const [callPhone, setCallPhone] = useState('');
  const [calling, setCalling] = useState(false);
  const [testAgent, setTestAgent] = useState<any | null>(null);

  const startCall = async () => {
    if (!callPhone.trim()) { toast.error('Enter a phone number (E.164, e.g. +9198…)'); return; }
    setCalling(true);
    try {
      const r = await fetch('/api/calls/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: callAgent.id, phone: callPhone.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`Calling ${callPhone}…`); setCallAgent(null); setCallPhone(''); }
      else toast.error(d.error || 'Could not start call');
    } finally { setCalling(false); }
  };

  const load = useCallback(async () => {
    const r = await fetch('/api/agents');
    if (r.ok) setAgents(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (agent: any) => {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    const r = await fetch('/api/agents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...agent, status: newStatus }) });
    if (r.ok) { setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a)); toast.success(`Agent ${newStatus === 'active' ? 'activated' : 'deactivated'}`); }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Delete this agent?')) return;
    const r = await fetch('/api/agents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (r.ok) { setAgents(prev => prev.filter(a => a.id !== id)); toast.success('Agent deleted'); }
  };

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || (a.description || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen pb-10">
      <Header title="AI Agents" subtitle="Create and manage your AI voice agents" action={{ label: 'New Agent', onClick: () => router.push('/dashboard/agents/builder') }} />
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-500" />
            <Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white dark:bg-[#0a1128] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" />
          </div>
          <Button onClick={() => router.push('/dashboard/agents/builder')} className="bg-emerald-600 hover:bg-emerald-500 text-white"><Plus className="w-4 h-4 mr-2" />New Agent</Button>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-44 bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl">
            <Brain className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-slate-900 dark:text-white font-semibold mb-2">No agents yet</h3>
            <p className="text-slate-600 dark:text-slate-500 text-sm mb-4">Create your first AI voice agent to start making calls</p>
            <Button onClick={() => router.push('/dashboard/agents/builder')} className="bg-emerald-600 hover:bg-emerald-500 text-white"><Plus className="w-4 h-4 mr-2" />Create Agent</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(agent => (
              <div key={agent.id} className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-5 hover:border-emerald-500/20 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{agent.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={cn('w-1.5 h-1.5 rounded-full', agent.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
                        <span className="text-xs text-slate-600 dark:text-slate-500 capitalize">{agent.status}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteAgent(agent.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 dark:text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-500 mb-4 line-clamp-2 min-h-[2rem]">{agent.description || 'No description'}</p>
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg p-2">
                    <div className="text-slate-600 dark:text-slate-500 mb-0.5">Language</div>
                    <div className="text-slate-900 dark:text-white uppercase">{agent.language || 'EN'}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg p-2">
                    <div className="text-slate-600 dark:text-slate-500 mb-0.5">Industry</div>
                    <div className="text-slate-900 dark:text-white capitalize">{agent.industry || '—'}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => toggleStatus(agent)} className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all', agent.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-100 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 hover:bg-white/[0.06]')}>
                    {agent.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {agent.status === 'active' ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => setTestAgent(agent)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all">
                    <MessageSquare className="w-3.5 h-3.5" />Test
                  </button>
                  <button onClick={() => { setCallAgent(agent); setCallPhone(''); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    <Phone className="w-3.5 h-3.5" />Call
                  </button>
                  <button onClick={() => router.push(`/dashboard/agents/${agent.id}/whatsapp`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all" title="WhatsApp Automation">
                    <MessageSquare className="w-3.5 h-3.5" />WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start Call dialog */}
      {testAgent && <SandboxModal agent={testAgent} onClose={() => setTestAgent(null)} />}

      {callAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !calling && setCallAgent(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 rounded-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Phone className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-semibold">Call with {callAgent.name}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-500">The AI agent will dial and speak live.</p>
              </div>
            </div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">Phone number (E.164)</label>
            <Input autoFocus value={callPhone} onChange={e => setCallPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && startCall()} placeholder="+919812345678" className="bg-slate-100 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" disabled={calling} onClick={() => setCallAgent(null)} className="flex-1 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">Cancel</Button>
              <Button disabled={calling} onClick={startCall} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white">{calling ? 'Starting…' : 'Start Call'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
