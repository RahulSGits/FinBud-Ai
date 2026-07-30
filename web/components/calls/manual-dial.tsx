'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Bot, Check, Loader2, PhoneCall, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { normalisePhone } from '@/lib/contacts/phone';
import { cn } from '@/lib/utils';

interface AgentOption {
  id: string;
  name: string;
  /** Which engine executes this agent's calls — livekit | omnidimension | mock. */
  voiceProvider: string;
}

interface Props {
  /** Route root for links out of the dialog: employees live under /dashboard. */
  basePath: '/admin' | '/dashboard';
}

const ENGINE_NAMES: Record<string, string> = {
  livekit: 'LiveKit',
  omnidimension: 'OmniDimension',
  mock: 'the built-in simulator',
};

const SECONDARY =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors';

const PRIMARY =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors';

const INPUT =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

function engineName(providerId: string): string {
  return ENGINE_NAMES[providerId] ?? providerId;
}

/**
 * Dial any number on demand.
 *
 * The AI agent still runs the conversation — this only replaces "wait for a
 * campaign to reach them" with "call this person now".
 */
export function ManualDial({ basePath }: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);

  // Whether this deployment is simulating calls is only knowable from a dial
  // response, so it is remembered once the first call comes back.
  const [simulated, setSimulated] = useState<boolean | null>(null);

  // Re-fetched on every open so an agent activated a moment ago is offered.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    fetch('/api/agents')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load your AI agents.');
        return data;
      })
      .then((data: unknown) => {
        if (cancelled) return;
        const active: AgentOption[] = (Array.isArray(data) ? data : [])
          .filter((a: any) => a && a.isActive)
          .map((a: any) => ({
            id: String(a.id),
            name: String(a.name ?? 'Untitled agent'),
            voiceProvider: String(a.voiceProvider ?? 'livekit'),
          }));
        setAgents(active);
        // One active agent is the normal case here; making someone pick it out
        // of a list of one is pure friction.
        setAgentId(active.length === 1 ? active[0].id : '');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load your AI agents.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, reload]);

  const typed = phone.trim();
  const international = typed.startsWith('+');

  // Validated with the very function the server normalises with, so the number
  // previewed here is the number that gets dialled.
  const dialled = useMemo(() => (typed ? normalisePhone(typed) : null), [typed]);
  const digits = typed.replace(/\D/g, '').length;

  const selectedAgent = agents.find((a) => a.id === agentId) ?? null;

  function openDialog() {
    setPhone('');
    setName('');
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!dialled) { toast.error('Enter a number we can dial first.'); return; }
    if (!agentId) { toast.error('Choose which AI agent should run this call.'); return; }

    const who = name.trim() || dialled;
    const agentName = selectedAgent?.name ?? 'Your agent';

    setBusy(true);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: dialled, name: name.trim() || null, agentId }),
      });
      const data = await res.json().catch(() => ({}));
      // The API answers with refusals a person can act on — "daily call limit
      // reached (100)", "that lead is assigned to someone else" — so show its
      // wording rather than flattening everything into "something went wrong".
      if (!res.ok) throw new Error(data.error || `Could not place the call (${res.status})`);

      const mock = Boolean(data.mock);
      setSimulated(mock);

      toast.success(mock ? `Simulated call to ${who} started` : `Calling ${who}…`, {
        description: mock
          ? 'Nothing was really dialled — this deployment runs calls through the simulator.'
          : `${agentName} is on the line. The transcript and outcome land in the call log.`,
        // There is no page for a single call; the log is where its row appears.
        action: { label: 'View call log', onClick: () => router.push(`${basePath}/calls`) },
      });

      setOpen(false);
      setPhone('');
      setName('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not place the call.');
    } finally {
      // Always cleared, so a failed dial never leaves the button spinning.
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={PRIMARY}>
        <Plus className="w-4 h-4" /> New call
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md my-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">New call</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Type a number and an AI agent dials it straight away.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loading ? (
                <div className="px-6 py-14 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              ) : loadError ? (
                <div className="px-6 py-10 text-center">
                  <AlertTriangle className="w-6 h-6 mx-auto text-amber-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Could not load your agents
                  </p>
                  <p className="text-xs text-slate-500 mt-1 mb-4 max-w-xs mx-auto">{loadError}</p>
                  <button type="button" onClick={() => setReload((n) => n + 1)} className={SECONDARY}>
                    Try again
                  </button>
                </div>
              ) : agents.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Bot className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No active AI agent</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4 max-w-xs mx-auto">
                    A manual call is still run by an agent. Build one, switch it to Active, then dial from here.
                  </p>
                  <Link href={`${basePath}/agents/new`} className={PRIMARY}>
                    <Plus className="w-4 h-4" /> Create an agent
                  </Link>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                        Phone number <span className="text-red-500">*</span>
                      </span>
                      <div className="flex items-stretch rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-brand-500">
                        <span
                          // Greyed out once a + is typed: the country code has
                          // been given, so +91 no longer applies.
                          className={cn(
                            'inline-flex items-center px-3.5 text-sm font-medium tabular-nums border-r border-slate-200 dark:border-white/10 transition-opacity',
                            international
                              ? 'text-slate-400 dark:text-slate-500 opacity-40'
                              : 'text-slate-600 dark:text-slate-300'
                          )}
                        >
                          +91
                        </span>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          inputMode="tel"
                          autoComplete="off"
                          autoFocus
                          placeholder="98765 43210"
                          aria-label="Phone number"
                          className="flex-1 min-w-0 h-10 bg-transparent px-3.5 text-sm tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                        />
                      </div>

                      {dialled ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-700 dark:text-brand-400 mt-1.5">
                          <Check className="w-3.5 h-3.5" /> Will dial {dialled}
                        </span>
                      ) : typed ? (
                        <span className="block text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                          Needs at least 10 digits — {digits} so far.
                        </span>
                      ) : (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                          10 digits for an Indian mobile, or start with + and the country code.
                        </span>
                      )}
                    </div>

                    <label className="block">
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                        Name <span className="text-slate-400">(optional)</span>
                      </span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Who are we calling?"
                        className={INPUT}
                      />
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Used when the number is new to the CRM. An existing contact keeps the name it has.
                      </span>
                    </label>

                    <label className="block">
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                        AI agent <span className="text-red-500">*</span>
                      </span>
                      <select
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        className={INPUT}
                      >
                        <option value="">Select an agent…</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </label>

                    {selectedAgent && (
                      <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                        <Bot className="w-4 h-4 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          <strong className="font-semibold text-slate-900 dark:text-white">
                            {selectedAgent.name}
                          </strong>{' '}
                          runs this call on {engineName(selectedAgent.voiceProvider)}.
                          {simulated === true && ' Calls are currently simulated — no real number is dialled.'}
                          {simulated === false && ' Calls are live and really dial out.'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/10">
                    <button type="button" onClick={close} disabled={busy} className={SECONDARY}>
                      Cancel
                    </button>
                    <button type="submit" disabled={busy || !dialled || !agentId} className={PRIMARY}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                      {busy ? 'Dialling…' : 'Call now'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
