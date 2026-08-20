'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, Check, Copy, Loader2, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyStatusBadge } from '@/components/platform/company-status-badge';
import { cn } from '@/lib/utils';

export type CompanyStatusValue = 'pending' | 'active' | 'suspended';

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatusValue;
  plan: string | null;
  contactEmail: string | null;
  createdAt: string;
  usage: { users: number; agents: number; contacts: number; calls: number; callMinutes: number };
  limits: {
    maxUsers: number | null;
    maxAgents: number | null;
    maxContacts: number | null;
    maxCallMinutes: number | null;
  };
}

/** The credentials a newly created company needs, shown once. */
interface NewTenant {
  companyName: string;
  email: string;
  password: string;
}

const FILTERS: { value: 'all' | CompanyStatusValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
];

/** "12 / 50" when a ceiling exists, "12" when it does not. */
function usageLabel(used: number, limit: number | null): string {
  return limit == null ? used.toLocaleString() : `${used.toLocaleString()} / ${limit.toLocaleString()}`;
}

/**
 * Is this figure at or past its ceiling?
 *
 * A null limit means no ceiling, so it is never over — the mistake this guards
 * against is treating null as zero, which would paint every unlimited customer
 * permanently red.
 */
function over(used: number, limit: number | null): boolean {
  return limit != null && limit > 0 && used >= limit;
}

export function CompaniesManager({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | CompanyStatusValue>('all');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewTenant | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: '',
    adminName: '',
    adminEmail: '',
    plan: '',
    maxUsers: '',
    maxCallMinutes: '',
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.contactEmail ?? '').toLowerCase().includes(q)
      );
    });
  }, [companies, query, filter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/platform/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        adminName: form.adminName || undefined,
        adminEmail: form.adminEmail,
        plan: form.plan || undefined,
        // Blank means "no ceiling", which is null rather than 0 — sending 0
        // would create a customer who cannot add a single user.
        maxUsers: form.maxUsers === '' ? undefined : Number(form.maxUsers),
        maxCallMinutes: form.maxCallMinutes === '' ? undefined : Number(form.maxCallMinutes),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      toast.error(data.error || 'Could not create the company');
      return;
    }

    setCreating(false);
    setForm({ name: '', adminName: '', adminEmail: '', plan: '', maxUsers: '', maxCallMinutes: '' });
    // Shown once, deliberately: the temporary password is not stored anywhere
    // it can be read back, so this panel is the only chance to pass it on.
    setCreated({
      companyName: data.company.name,
      email: data.admin.email,
      password: data.temporaryPassword,
    });
    router.refresh();
  }

  async function copyCredentials() {
    if (!created) return;
    await navigator.clipboard.writeText(
      `${created.companyName}\nSign in: ${created.email}\nTemporary password: ${created.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, handle or contact email"
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500/50"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 h-7 rounded-lg text-xs font-medium transition-colors',
                filter === f.value
                  ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
        >
          {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {creating ? 'Cancel' : 'New company'}
        </button>
      </div>

      <AnimatePresence>
        {created && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {created.companyName} is ready
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Pass these on to the customer. The password is temporary — their administrator
                  must replace it before the account can do anything, and it is not shown again.
                </p>
                <dl className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Sign in</dt>
                    <dd className="font-medium text-slate-900 dark:text-white break-all">{created.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Temporary password</dt>
                    <dd className="font-mono font-medium text-slate-900 dark:text-white">{created.password}</dd>
                  </div>
                </dl>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={copyCredentials}
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setCreated(null)}
                  aria-label="Dismiss"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-white/50 dark:hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {creating && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={create}
            className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03]"
          >
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Onboard a company</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  The company and its first administrator are created together — a tenant nobody can
                  sign into is not a usable one.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Company name"
                  required
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  placeholder="Acme Financial Services"
                />
                <Field
                  label="Plan"
                  value={form.plan}
                  onChange={(v) => setForm({ ...form, plan: v })}
                  placeholder="Growth"
                />
                <Field
                  label="Administrator name"
                  value={form.adminName}
                  onChange={(v) => setForm({ ...form, adminName: v })}
                  placeholder="Priya Sharma"
                />
                <Field
                  label="Administrator email"
                  required
                  type="email"
                  value={form.adminEmail}
                  onChange={(v) => setForm({ ...form, adminEmail: v })}
                  placeholder="priya@acme.com"
                />
                <Field
                  label="User limit"
                  type="number"
                  value={form.maxUsers}
                  onChange={(v) => setForm({ ...form, maxUsers: v })}
                  placeholder="Leave blank for unlimited"
                />
                <Field
                  label="Call minutes"
                  type="number"
                  value={form.maxCallMinutes}
                  onChange={(v) => setForm({ ...form, maxCallMinutes: v })}
                  placeholder="Leave blank for unlimited"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !form.name.trim() || !form.adminEmail.trim()}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                  {busy ? 'Creating…' : 'Create company'}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        {shown.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Building2 className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {companies.length === 0 ? 'No companies yet' : 'Nothing matches that'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {companies.length === 0
                ? 'Onboard the first customer to see them here.'
                : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {shown.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/platform/companies/${c.id}`}
                  className="group flex flex-wrap items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {c.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {c.plan ?? 'No plan'} · {c.contactEmail ?? c.slug}
                    </p>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 text-right">
                    <Metric
                      label="people"
                      value={usageLabel(c.usage.users, c.limits.maxUsers)}
                      warn={over(c.usage.users, c.limits.maxUsers)}
                    />
                    <Metric label="agents" value={usageLabel(c.usage.agents, c.limits.maxAgents)} warn={over(c.usage.agents, c.limits.maxAgents)} />
                    <Metric
                      label="minutes"
                      value={usageLabel(c.usage.callMinutes, c.limits.maxCallMinutes)}
                      warn={over(c.usage.callMinutes, c.limits.maxCallMinutes)}
                    />
                  </div>

                  <CompanyStatusBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div className="hidden sm:block">
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          warn ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500/50"
      />
    </label>
  );
}
