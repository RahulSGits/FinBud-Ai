'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, Building2, Check, CheckCircle2, Clock, FlaskConical, KeyRound,
  Loader2, Mic, Minus, Plug, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UsageCard } from '@/components/settings/usage-card';

export interface BusinessHoursSetting {
  tz: string;
  days: number[];
  start: string;
  end: string;
}

export interface PlatformSettings {
  companyName: string;
  dailyCallLimit: number;
  businessHours: BusinessHoursSetting;
  retryLimit: number;
  retryDelayMins: number;
}

export interface ProviderCapabilityFlags {
  serverAgents: boolean;
  knowledgeBase: boolean;
  phoneNumbers: boolean;
  voiceCatalogue: boolean;
  webhooks: boolean;
}

export interface ProviderCard {
  id: string;
  name: string;
  configured: boolean;
  isDefault: boolean;
  capabilities: ProviderCapabilityFlags;
}

export interface IntegrationStatus {
  id: string;
  label: string;
  envVar: string;
  configured: boolean;
  /** What stops working while the variable is missing. Rendered after "Without it:". */
  impact: string;
}

interface Props {
  settings: PlatformSettings;
  providers: ProviderCard[];
  /** True when USE_MOCK_CALLS makes every call a simulation. */
  mockMode: boolean;
  integrations: IntegrationStatus[];
}

interface Draft {
  companyName: string;
  dailyCallLimit: string;
  retryLimit: string;
  retryDelayMins: string;
  tz: string;
  days: number[];
  start: string;
  end: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CAPABILITIES: { key: keyof ProviderCapabilityFlags; label: string }[] = [
  { key: 'serverAgents', label: 'Server agents' },
  { key: 'knowledgeBase', label: 'Knowledge base' },
  { key: 'phoneNumbers', label: 'Phone numbers' },
  { key: 'voiceCatalogue', label: 'Voice catalogue' },
  { key: 'webhooks', label: 'Webhooks' },
];

/** Credentials live in the environment, never in the database. */
const PROVIDER_ENV: Record<string, string[]> = {
  livekit: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_SIP_TRUNK_ID'],
  omnidimension: ['OMNIDIM_API_KEY'],
  mock: [],
};

const INPUT =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

const CODE =
  'px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 font-mono text-[11px] text-slate-700 dark:text-slate-200';

const CARD = 'rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03]';

function toInt(raw: string, fallback: number, lo: number, hi: number): number {
  const n = Math.trunc(Number(raw));
  if (!raw.trim() || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(n, hi));
}

function toDraft(settings: PlatformSettings): Draft {
  return {
    companyName: settings.companyName,
    dailyCallLimit: String(settings.dailyCallLimit),
    retryLimit: String(settings.retryLimit),
    retryDelayMins: String(settings.retryDelayMins),
    tz: settings.businessHours.tz,
    days: [...settings.businessHours.days].sort((a, b) => a - b),
    start: settings.businessHours.start,
    end: settings.businessHours.end,
  };
}

function sameHours(a: BusinessHoursSetting, b: BusinessHoursSetting): boolean {
  return a.tz === b.tz && a.start === b.start && a.end === b.end && a.days.join(',') === b.days.join(',');
}

export function SettingsManager({ settings, providers, mockMode, integrations }: Props) {
  const router = useRouter();

  const [saved, setSaved] = useState<PlatformSettings>(settings);
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const next = useMemo<PlatformSettings>(
    () => ({
      companyName: draft.companyName.trim(),
      dailyCallLimit: toInt(draft.dailyCallLimit, saved.dailyCallLimit, 1, 100_000),
      businessHours: {
        tz: draft.tz.trim() || 'Asia/Kolkata',
        days: [...draft.days].sort((a, b) => a - b),
        start: draft.start,
        end: draft.end,
      },
      retryLimit: toInt(draft.retryLimit, saved.retryLimit, 0, 10),
      retryDelayMins: toInt(draft.retryDelayMins, saved.retryDelayMins, 1, 10_080),
    }),
    [draft, saved]
  );

  // Only what actually moved is sent, so the audit entry names the real change
  // instead of listing every key on every save.
  const changed = useMemo<Partial<PlatformSettings>>(() => {
    const out: Partial<PlatformSettings> = {};
    if (next.companyName !== saved.companyName) out.companyName = next.companyName;
    if (next.dailyCallLimit !== saved.dailyCallLimit) out.dailyCallLimit = next.dailyCallLimit;
    if (next.retryLimit !== saved.retryLimit) out.retryLimit = next.retryLimit;
    if (next.retryDelayMins !== saved.retryDelayMins) out.retryDelayMins = next.retryDelayMins;
    if (!sameHours(next.businessHours, saved.businessHours)) out.businessHours = next.businessHours;
    return out;
  }, [next, saved]);

  const dirty = Object.keys(changed).length > 0;

  function toggleDay(day: number) {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b),
    }));
  }

  async function save() {
    if (busy || !dirty) return;

    if (!next.companyName) { toast.error('Give the company a name.'); return; }
    if (next.businessHours.days.length === 0) { toast.error('Pick at least one calling day.'); return; }
    if (!next.businessHours.start || !next.businessHours.end) {
      toast.error('Set the start and end of the calling window.');
      return;
    }
    if (next.businessHours.start === next.businessHours.end) {
      toast.error('The calling window cannot start and end at the same time.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save these settings.');

      setSaved(next);
      // Adopt the clamped values, so the form shows exactly what was stored.
      setDraft(toDraft(next));
      toast.success('Settings saved');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save these settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* 1 — Platform defaults */}
      <section className={cn(CARD, 'p-5 space-y-5')}>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Platform defaults</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-3">
          The daily limit is enforced on every call anyone places. The calling window and retry policy record
          how this company works — each campaign carries its own copy, set when the campaign is created.
        </p>

        <Field label="Company name" required>
          <input
            value={draft.companyName}
            onChange={(e) => set('companyName', e.target.value)}
            placeholder="Finance Buddha"
            className={INPUT}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Daily calls per person" hint="A member with their own limit on the Team screen overrides this.">
            <input
              type="number"
              min={1}
              max={100_000}
              value={draft.dailyCallLimit}
              onChange={(e) => set('dailyCallLimit', e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Retries per contact" hint="0 means one attempt only.">
            <input
              type="number"
              min={0}
              max={10}
              value={draft.retryLimit}
              onChange={(e) => set('retryLimit', e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Retry delay (minutes)">
            <input
              type="number"
              min={1}
              max={10_080}
              value={draft.retryDelayMins}
              onChange={(e) => set('retryDelayMins', e.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Calling window</h3>
          </div>

          <Field label="Timezone" hint="An IANA name, e.g. Asia/Kolkata.">
            <input
              value={draft.tz}
              onChange={(e) => set('tz', e.target.value)}
              placeholder="Asia/Kolkata"
              className={INPUT}
            />
          </Field>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((label, i) => {
                const on = draft.days.includes(i);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-pressed={on}
                    className={cn(
                      'h-9 px-3 rounded-xl border text-xs font-medium transition-colors',
                      on
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="From">
              <input type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} className={INPUT} />
            </Field>
            <Field label="Until">
              <input type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} className={INPUT} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium',
              dirty ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
            )}
          >
            {dirty ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save defaults
          </button>
        </div>
      </section>

      {/* 2 — Voice engines */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Voice engines</h2>
        </div>

        {mockMode && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3.5">
            <FlaskConical className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Mock mode is on — every call is simulated
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                No customer is dialled, no telephony minutes are used and no model spend is incurred. Transcripts and
                outcomes are generated locally so the whole product can be demonstrated end to end. This is controlled
                by <code className={CODE}>USE_MOCK_CALLS</code> — set it to <code className={CODE}>false</code> (or
                remove it) and restart the server to place real calls.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/10 px-4 py-3.5">
          <KeyRound className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Credentials live in environment variables on the server — they are never stored in this database and there
            is deliberately no field here to paste one into. To connect an engine, set its variables in your deployment
            and restart.
          </p>
        </div>

        {providers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Mic className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No voice engines registered</p>
            <p className="text-xs text-slate-500 mt-1">Add an adapter in lib/providers to see it here.</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {providers.map((p) => {
              const vars = PROVIDER_ENV[p.id] ?? [];
              return (
                <li key={p.id} className={cn(CARD, 'p-5 flex flex-col')}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {p.isDefault && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-600 text-white">
                          Default
                        </span>
                      )}
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium',
                          p.configured
                            ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                        )}
                      >
                        {p.configured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>

                  {mockMode && p.id !== 'mock' && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                      Bypassed while mock mode is on.
                    </p>
                  )}

                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                    {CAPABILITIES.map((c) => {
                      const on = p.capabilities[c.key];
                      return (
                        <li
                          key={c.key}
                          className={cn(
                            'flex items-center gap-1.5 text-xs',
                            on ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'
                          )}
                        >
                          {on ? (
                            <Check className="w-3.5 h-3.5 shrink-0 text-brand-600 dark:text-brand-400" />
                          ) : (
                            <Minus className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">{c.label}</span>
                        </li>
                      );
                    })}
                  </ul>

                  {vars.length > 0 && (
                    <div className="mt-auto pt-4">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">Environment variables</p>
                      <div className="flex flex-wrap gap-1.5">
                        {vars.map((v) => (
                          <code key={v} className={CODE}>{v}</code>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Directly under the engines, because "what will this cost" is the
            next question after "which engine". Loads on its own so a slow or
            unreachable provider cannot hold up the settings page. */}
        <UsageCard />
      </section>

      {/* 3 — Integrations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Integrations</h2>
        </div>

        <ul className={cn(CARD, 'divide-y divide-slate-100 dark:divide-white/[0.06]')}>
          {integrations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{i.label}</span>
                  <code className={CODE}>{i.envVar}</code>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Without it: {i.impact}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium',
                  i.configured
                    ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                )}
              >
                {i.configured ? <CheckCircle2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {i.configured ? 'Configured' : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
