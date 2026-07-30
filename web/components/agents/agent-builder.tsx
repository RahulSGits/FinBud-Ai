'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Sparkles, Loader2, Wand2, Save, AlertCircle, Bot, Trash2, PhoneForwarded,
  BookOpen, CheckCircle2, CloudOff, X, Check, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type SectionKey =
  | 'firstMessage' | 'systemPrompt' | 'businessContext' | 'callObjective'
  | 'qualificationRules' | 'objectionHandling' | 'complianceRules' | 'closingScript';

interface AgentDraft {
  id?: string;
  name: string;
  description: string;
  firstMessage: string;
  systemPrompt: string;
  businessContext: string;
  callObjective: string;
  qualificationRules: string;
  objectionHandling: string;
  complianceRules: string;
  closingScript: string;
  llmModel: string;
  sttModel: string;
  ttsModel: string;
  voiceId: string;
  language: string;
  transferEnabled: boolean;
  transferNumber: string;
  useKnowledgeBase: boolean;
  isActive: boolean;
}

/** What the edit page hands over: the draft plus read-only sync state. */
export interface AgentInitial extends Partial<AgentDraft> {
  syncedAt?: string | null;
  syncError?: string | null;
}

/** Where the builder lives. Employees get the same tool under /dashboard. */
export type AgentBasePath = '/admin/agents' | '/dashboard/agents';

export interface AgentBuilderProps {
  initial?: AgentInitial;
  /** Route to return to after a save or a delete. */
  basePath?: AgentBasePath;
  /**
   * Whether this user may change the agent. Decided on the server from the
   * session and the agent's author — never inferred here, because the client
   * has no trustworthy way to know who is signed in.
   */
  canEdit?: boolean;
  /** Author's name, shown when the builder is read-only. */
  authorName?: string | null;
}

interface ModelOption {
  id: string;
  name: string;
  kind: 'llm' | 'stt' | 'tts';
}

interface VoiceOption {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}

const EMPTY: AgentDraft = {
  name: '', description: '', firstMessage: '', systemPrompt: '', businessContext: '',
  callObjective: '', qualificationRules: '', objectionHandling: '', complianceRules: '',
  closingScript: '',
  llmModel: 'openai/gpt-4o-mini', sttModel: 'deepgram/nova-3',
  ttsModel: 'cartesia/sonic-3', voiceId: '', language: 'multi',
  transferEnabled: false, transferNumber: '', useKnowledgeBase: false, isActive: false,
};

const DRAFT_KEYS = Object.keys(EMPTY) as (keyof AgentDraft)[];

// Used only when the provider catalogue cannot be reached, so the form is never
// unusable — a voice stack must always be selectable.
const FALLBACK_MODELS: ModelOption[] = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini (fast, cheap)', kind: 'llm' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (most capable)', kind: 'llm' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', kind: 'llm' },
  { id: 'deepgram/nova-3', name: 'Deepgram Nova-3', kind: 'stt' },
  { id: 'assemblyai/universal', name: 'AssemblyAI Universal', kind: 'stt' },
  { id: 'cartesia/sonic-3', name: 'Cartesia Sonic-3 (lowest latency)', kind: 'tts' },
  { id: 'elevenlabs/eleven_turbo_v2_5', name: 'ElevenLabs Turbo', kind: 'tts' },
];

const LANGUAGES: { code: string; name: string }[] = [
  { code: 'multi', name: 'Multilingual (auto-detect)' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
];

const SECTIONS: { key: SectionKey; label: string; hint: string; rows: number }[] = [
  { key: 'firstMessage', label: 'Opening line', hint: 'Spoken the moment they answer. Use {{customer_name}} for their name.', rows: 2 },
  { key: 'systemPrompt', label: 'Persona & tone', hint: 'Who the agent is and how it should sound.', rows: 4 },
  { key: 'businessContext', label: 'Business context', hint: 'Facts about your products the agent may rely on.', rows: 5 },
  { key: 'callObjective', label: 'Call objective', hint: 'The one measurable goal of the call.', rows: 3 },
  { key: 'qualificationRules', label: 'Qualification rules', hint: 'What to ask, and what makes a lead qualified.', rows: 5 },
  { key: 'objectionHandling', label: 'Objection handling', hint: 'Common pushback and how to respond.', rows: 5 },
  { key: 'complianceRules', label: 'Compliance', hint: 'What the agent must always and never do.', rows: 4 },
  { key: 'closingScript', label: 'Closing', hint: 'How to end for each outcome.', rows: 4 },
];

function optionsFor(kind: ModelOption['kind'], models: ModelOption[]): ModelOption[] {
  const found = models.filter((m) => m.kind === kind);
  return found.length ? found : FALLBACK_MODELS.filter((m) => m.kind === kind);
}

/**
 * Keep a saved value selectable even when the provider no longer lists it —
 * otherwise opening an old agent would silently move it onto a different model.
 */
function withCurrent<T extends { id: string; name: string }>(options: T[], current: string) {
  if (!current || options.some((o) => o.id === current)) return options.map((o) => ({ id: o.id, name: o.name }));
  return [...options.map((o) => ({ id: o.id, name: o.name })), { id: current, name: `${current} (not listed)` }];
}

export function AgentBuilder({
  initial,
  basePath = '/admin/agents',
  canEdit = true,
  authorName,
}: AgentBuilderProps) {
  const router = useRouter();

  const source: AgentInitial = initial ?? {};
  const { syncedAt: initialSyncedAt, syncError: initialSyncError, ...initialDraft } = source;
  const start: AgentDraft = { ...EMPTY, ...initialDraft };

  const [draft, setDraft] = useState<AgentDraft>(start);
  const [saved, setSaved] = useState<AgentDraft>(start);
  const [sync, setSync] = useState<{ syncedAt: string | null; syncError: string | null }>({
    syncedAt: initialSyncedAt ?? null,
    syncError: initialSyncError ?? null,
  });

  const [idea, setIdea] = useState('');
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState<SectionKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Someone else's agent: show it in full, but let nothing be typed or
  // submitted. Better a locked form than a 403 after ten minutes of writing.
  const readOnly = !canEdit;

  const set = (key: keyof AgentDraft, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  const dirty = useMemo(() => DRAFT_KEYS.some((k) => draft[k] !== saved[k]), [draft, saved]);

  // Model and voice catalogues come from the provider, never from this file.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [modelRes, voiceRes] = await Promise.allSettled([
        fetch('/api/providers/models').then((r) => r.json()),
        fetch('/api/providers/voices').then((r) => r.json()),
      ]);
      if (cancelled) return;

      let problem: string | null = null;

      if (modelRes.status === 'fulfilled' && Array.isArray(modelRes.value?.items) && modelRes.value.items.length) {
        setModels(modelRes.value.items as ModelOption[]);
      } else {
        problem = modelRes.status === 'rejected'
          ? 'Could not reach the voice provider.'
          : modelRes.value?.error || 'The provider returned no models.';
      }

      if (voiceRes.status === 'fulfilled' && Array.isArray(voiceRes.value?.items)) {
        setVoices(voiceRes.value.items as VoiceOption[]);
      }

      setCatalogueError(problem);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // A half-written prompt is expensive to lose to a stray back button.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function generate() {
    if (readOnly) return;
    if (idea.trim().length < 10) {
      toast.error('Describe the agent in a sentence or two.');
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setDraft((d) => ({ ...d, ...data.agent }));
      toast.success('Draft generated — review every section before activating.');
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function enhance(section: SectionKey) {
    if (readOnly) return;
    setEnhancing(section);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          current: draft[section],
          name: draft.name,
          description: draft.description,
          callObjective: draft.callObjective,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enhance failed');

      set(section, data.text);
      toast.success('Section rewritten.');
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setEnhancing(null);
    }
  }

  async function save() {
    if (readOnly) return;
    if (!draft.name.trim()) {
      toast.error('Give the agent a name.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/agents', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          name: draft.name.trim(),
          // Optional columns stay null rather than becoming empty strings.
          voiceId: draft.voiceId || null,
          transferNumber: draft.transferNumber.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');

      const wasCreate = !draft.id;
      // Adopt the server's id straight away, so a second save edits the agent
      // just created instead of making another one.
      const next: AgentDraft = {
        ...draft,
        id: draft.id ?? data.id,
        name: draft.name.trim(),
        transferNumber: draft.transferNumber.trim(),
      };
      setDraft(next);
      setSaved(next);
      setSync({ syncedAt: data.syncedAt ?? null, syncError: data.syncError ?? null });

      if (data.syncError) toast.warning(`Saved, but not synced: ${data.syncError}`);
      else toast.success(wasCreate ? 'Agent created' : 'Agent updated');

      if (wasCreate) router.push(data.id ? `${basePath}/${data.id}` : basePath);
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (readOnly || !draft.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 409 names the campaigns still pointing at this agent; show that
        // message as written rather than a generic failure.
        setDeleteError(data.error || 'Could not delete this agent.');
        return;
      }
      setSaved(draft); // stop the unsaved-changes guard blocking navigation
      toast.success('Agent deleted');
      setConfirming(false);
      router.push(basePath);
      router.refresh();
    } catch (e: any) {
      setDeleteError(e.message || 'Could not delete this agent.');
    } finally {
      setDeleting(false);
    }
  }

  const llmOptions = withCurrent(optionsFor('llm', models), draft.llmModel);
  const sttOptions = withCurrent(optionsFor('stt', models), draft.sttModel);
  const ttsOptions = withCurrent(optionsFor('tts', models), draft.ttsModel);
  const voiceOptions = withCurrent(
    voices.map((v) => ({
      id: v.id,
      name: [v.name, v.language, v.gender].filter(Boolean).join(' · '),
    })),
    draft.voiceId
  );

  return (
    <div className="max-w-3xl space-y-6">
      {readOnly ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Read-only</h2>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {authorName ? `${authorName} created this agent.` : 'A colleague created this agent.'}{' '}
                Only its author or an administrator can change it.
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                You can still pick it for your own campaigns and calls. To make your own version,
                create a new agent and paste anything useful across.
              </p>
            </div>
          </div>
        </motion.section>
      ) : (
        /* Describe-it-and-go */
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {draft.id ? 'Rewrite this agent' : 'Describe your agent'}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            One or two sentences. Every section below gets filled in — you review before activating.
          </p>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={2}
            placeholder="An agent that calls people who applied for a home loan online, checks if they still want it, and books a callback with a loan officer."
            className="w-full rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          <button
            onClick={generate}
            disabled={generating}
            className="mt-3 inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? 'Generating…' : draft.id ? 'Regenerate sections' : 'Generate agent'}
          </button>

          {aiError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium">AI authoring unavailable</p>
                <p className="mt-0.5">{aiError}</p>
                <p className="mt-1 text-amber-600/80 dark:text-amber-400/70">
                  You can still write every section by hand below.
                </p>
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* Sync state — only meaningful once the agent exists */}
      {draft.id && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            {sync.syncError ? (
              <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            ) : sync.syncedAt ? (
              <CheckCircle2 className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
            ) : (
              <CloudOff className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Voice engine</h2>
              {sync.syncError ? (
                <>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">{sync.syncError}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {readOnly
                      ? 'Its author can retry the push by saving the agent again.'
                      : 'The agent is saved here. Saving again retries the push.'}
                  </p>
                </>
              ) : sync.syncedAt ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Last synced {new Date(sync.syncedAt).toLocaleString([], {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {readOnly
                    ? 'Not synced yet — this agent has not been pushed to the engine.'
                    : 'Not synced yet — save to push this agent to the engine.'}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Identity */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Identity</h2>
        </div>
        <Field label="Agent name" required={!readOnly}>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={readOnly}
            placeholder="Loan Qualification Agent"
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <input
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            disabled={readOnly}
            placeholder="Calls inbound home-loan applicants to qualify and book callbacks"
            className={inputClass}
          />
        </Field>
      </section>

      {/* Prompt sections */}
      {SECTIONS.map((s) => (
        <section key={s.key} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{s.label}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.hint}</p>
            </div>
            {!readOnly && (
              <button
                onClick={() => enhance(s.key)}
                disabled={enhancing !== null}
                title="Rewrite this section with AI"
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40 transition-colors"
              >
                {enhancing === s.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Enhance
              </button>
            )}
          </div>
          <textarea
            value={draft[s.key]}
            onChange={(e) => set(s.key, e.target.value)}
            disabled={readOnly}
            rows={s.rows}
            className="mt-2 w-full rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </section>
      ))}

      {/* Voice stack */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Voice stack</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          Loaded from the configured voice provider — no separate provider keys needed.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Language model">
            <select value={draft.llmModel} onChange={(e) => set('llmModel', e.target.value)} disabled={readOnly} className={inputClass}>
              {llmOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Speech recognition">
            <select value={draft.sttModel} onChange={(e) => set('sttModel', e.target.value)} disabled={readOnly} className={inputClass}>
              {sttOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Speech synthesis">
            <select value={draft.ttsModel} onChange={(e) => set('ttsModel', e.target.value)} disabled={readOnly} className={inputClass}>
              {ttsOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Voice">
            <select value={draft.voiceId} onChange={(e) => set('voiceId', e.target.value)} disabled={readOnly} className={inputClass}>
              <option value="">Provider default</option>
              {voiceOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <select value={draft.language} onChange={(e) => set('language', e.target.value)} disabled={readOnly} className={inputClass}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
        </div>

        {catalogueError && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            {catalogueError} Showing built-in defaults.
          </p>
        )}
      </section>

      {/* Call transfer */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <PhoneForwarded className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Call transfer</h2>
        </div>
        <Toggle
          checked={draft.transferEnabled}
          onChange={(v) => set('transferEnabled', v)}
          disabled={readOnly}
          label="Let the agent hand the call to a human"
          hint="Used when the customer asks for a person, or the agent cannot answer."
        />
        <Field label="Transfer number">
          <input
            type="tel"
            inputMode="tel"
            value={draft.transferNumber}
            disabled={readOnly || !draft.transferEnabled}
            onChange={(e) => set('transferNumber', e.target.value)}
            placeholder="+91 98765 43210"
            className={inputClass}
          />
        </Field>
      </section>

      {/* Knowledge base */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Knowledge base</h2>
        </div>
        <Toggle
          checked={draft.useKnowledgeBase}
          onChange={(v) => set('useKnowledgeBase', v)}
          disabled={readOnly}
          label="Let this agent search the knowledge base during calls"
          hint="Answers are grounded in your uploaded documents instead of guessed."
        />
      </section>

      {/* Save */}
      {readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {draft.isActive
              ? 'Active — campaigns can use this agent'
              : 'Draft — not yet available to campaigns'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Lock className="w-3.5 h-3.5" /> Locked
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-brand-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Active — campaigns can use this agent
            </span>
          </label>
          <div className="flex items-center gap-3">
            {draft.id && (
              <span className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium',
                dirty ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
              )}>
                {dirty ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving || (!!draft.id && !dirty)}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {draft.id ? 'Save changes' : 'Create agent'}
            </button>
          </div>
        </div>
      )}

      {/* Delete */}
      {draft.id && !readOnly && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Delete this agent</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Campaigns that use it must be deleted first. Past calls are kept.
            </p>
          </div>
          <button
            onClick={() => { setDeleteError(null); setConfirming(true); }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-red-200 dark:border-red-500/20 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete agent
          </button>
        </section>
      )}

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deleting && setConfirming(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Delete {draft.name || 'this agent'}?</h2>
                <button
                  onClick={() => !deleting && setConfirming(false)}
                  className="p-1 -mr-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                This removes the agent from the voice engine as well. It cannot be undone.
              </p>

              {deleteError && (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 break-words">{deleteError}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const inputClass =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked, onChange, label, hint, disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 select-none',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
    )}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span className={cn(
        'relative shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500',
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/10'
      )}>
        <span className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-4'
        )} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-700 dark:text-slate-300">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
