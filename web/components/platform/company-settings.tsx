'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'active' | 'suspended';

export interface EditableCompany {
  id: string;
  name: string;
  status: Status;
  plan: string | null;
  maxUsers: number | null;
  maxAgents: number | null;
  maxCampaigns: number | null;
  maxContacts: number | null;
  maxCallsPerDay: number | null;
  maxCallMinutes: number | null;
  maxConcurrent: number | null;
}

type LimitKey =
  | 'maxUsers' | 'maxAgents' | 'maxCampaigns' | 'maxContacts'
  | 'maxCallsPerDay' | 'maxCallMinutes' | 'maxConcurrent';

const LIMITS: { key: LimitKey; label: string; hint: string }[] = [
  { key: 'maxUsers', label: 'People', hint: 'Accounts that can sign in' },
  { key: 'maxAgents', label: 'AI agents', hint: 'Published and draft' },
  { key: 'maxCampaigns', label: 'Campaigns', hint: 'Total campaigns' },
  { key: 'maxContacts', label: 'Contacts', hint: 'Leads on file' },
  { key: 'maxCallsPerDay', label: 'Calls per day', hint: 'Resets at midnight' },
  { key: 'maxCallMinutes', label: 'Call minutes', hint: 'Billable minutes' },
  { key: 'maxConcurrent', label: 'Concurrent calls', hint: 'On the phones at once' },
];

const STATUSES: { value: Status; label: string; description: string }[] = [
  { value: 'pending', label: 'Pending', description: 'Cannot sign in yet' },
  { value: 'active', label: 'Active', description: 'Full access' },
  { value: 'suspended', label: 'Suspended', description: 'Access refused, data kept' },
];

/** Blank means "no ceiling", which is null — never 0. */
function toField(v: number | null): string {
  return v == null ? '' : String(v);
}

export function CompanySettings({ company }: { company: EditableCompany }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(company.name);
  const [plan, setPlan] = useState(company.plan ?? '');
  const [status, setStatus] = useState<Status>(company.status);
  const [limits, setLimits] = useState<Record<LimitKey, string>>({
    maxUsers: toField(company.maxUsers),
    maxAgents: toField(company.maxAgents),
    maxCampaigns: toField(company.maxCampaigns),
    maxContacts: toField(company.maxContacts),
    maxCallsPerDay: toField(company.maxCallsPerDay),
    maxCallMinutes: toField(company.maxCallMinutes),
    maxConcurrent: toField(company.maxConcurrent),
  });

  const dirty =
    name !== company.name ||
    plan !== (company.plan ?? '') ||
    status !== company.status ||
    LIMITS.some(({ key }) => limits[key] !== toField(company[key]));

  async function save() {
    setBusy(true);
    // An empty box is sent as explicit null, which the API reads as "remove the
    // ceiling". Sending 0 instead would look like a saved limit and stop the
    // customer doing anything at all.
    const payload: Record<string, unknown> = { name, plan: plan || null, status };
    for (const { key } of LIMITS) {
      payload[key] = limits[key] === '' ? null : Number(limits[key]);
    }

    const res = await fetch(`/api/platform/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      toast.error(data.error || 'Could not save');
      return;
    }
    const changed: string[] = data.changed ?? [];
    // The API reports what actually differed, so a save that changed nothing
    // says so rather than claiming a number.
    toast.success(
      changed.length === 0
        ? 'Nothing had changed'
        : `Saved · ${changed.length} change${changed.length === 1 ? '' : 's'}`
    );
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Plan and limits</h2>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </header>

      <div className="p-5 space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
              Company name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
              Plan
            </span>
            <input
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="No plan"
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500/50"
            />
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Access</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={cn(
                  'text-left px-3 py-2.5 rounded-xl border transition-colors',
                  status === s.value
                    ? 'border-brand-500/50 bg-brand-500/5'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                  {s.value === 'suspended' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <ShieldCheck
                      className={cn('w-3.5 h-3.5', s.value === 'active' ? 'text-brand-500' : 'text-amber-500')}
                    />
                  )}
                  {s.label}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {s.description}
                </span>
              </button>
            ))}
          </div>
          {status === 'suspended' && company.status !== 'suspended' && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Everyone at this company will be refused at sign-in. Their data is kept and comes back
              when you set them active again.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Limits</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Blank means no ceiling</p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {LIMITS.map((l) => (
              <label key={l.key} className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                  {l.label}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5 block">
                  {l.hint}
                </span>
                <input
                  type="number"
                  min={0}
                  value={limits[l.key]}
                  placeholder="Unlimited"
                  onChange={(e) => setLimits({ ...limits, [l.key]: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500/50"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
