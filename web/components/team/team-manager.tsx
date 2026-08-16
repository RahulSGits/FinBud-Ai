'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BadgeCheck, Check, ChevronDown, Clock, Copy, Eye, KeyRound, Loader2,
  Mail, Search, UserCog, UserMinus, UserPlus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { InviteMember } from '@/components/team/invite-member';
import { cn } from '@/lib/utils';

/// Mirrors the Prisma Role enum. Widened from the original two so a role
/// added to the schema cannot silently fall through a lookup table here.
export type MemberRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'employee'
  | 'viewer';
export type MemberStatus = 'invited' | 'active' | 'disabled';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  role: MemberRole;
  status: MemberStatus;
  phone: string | null;
  department: string | null;
  designation: string | null;
  dailyCallLimit: number | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  leads: number;
  callsToday: number;
  completed: number;
  interested: number;
}

interface Credential {
  name: string;
  email: string;
  password: string;
  reason: 'created' | 'reset';
}

const STATUS_TONE: Record<MemberStatus, string> = {
  active: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  invited: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  disabled: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

const ROLE_TONE: Record<MemberRole, string> = {
  // The platform owner reads as distinct from a company's own administrator,
  // because confusing the two is exactly the mistake worth preventing on a
  // screen where somebody hands out access.
  super_admin: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400',
  admin: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  manager: 'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400',
  employee: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  viewer: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500',
};

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TeamManager({
  members,
  currentUserId,
}: {
  members: TeamMember[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TeamMember[]>(members);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'disable'; member: TeamMember } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // router.refresh() re-renders the server page: adopt its rows as the truth,
  // which also settles any optimistic edit that has since been persisted.
  useEffect(() => setRows(members), [members]);

  const filtered = rows.filter((m) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      m.name.toLowerCase().includes(t) ||
      m.email.toLowerCase().includes(t) ||
      (m.employeeId ?? '').toLowerCase().includes(t) ||
      (m.department ?? '').toLowerCase().includes(t)
    );
  });

  async function patch(
    id: string,
    body: Record<string, unknown>,
    optimistic?: Partial<TeamMember>
  ): Promise<{ defaultPassword?: string } | null> {
    // Revert only the row that failed, so a concurrent edit elsewhere survives.
    const before = rows.find((r) => r.id === id) ?? null;
    const revert = () => {
      if (before) setRows((rs) => rs.map((r) => (r.id === id ? before : r)));
    };
    if (optimistic) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...optimistic } : r)));
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server refuses last-admin demotions and self-disables with wording
        // worth showing exactly as written.
        revert();
        toast.error(d.error || 'Could not update this member');
        return null;
      }
      router.refresh();
      return d as { defaultPassword?: string };
    } catch {
      revert();
      toast.error('Network error — nothing was changed');
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(m: TeamMember, role: MemberRole) {
    if (role === m.role) return;
    const ok = await patch(m.id, { role }, { role });
    if (ok) toast.success(`${m.name} is now ${role === 'admin' ? 'an admin' : 'an employee'}`);
  }

  async function changeStatus(m: TeamMember, status: MemberStatus) {
    if (status === m.status) return;
    const ok = await patch(m.id, { status }, { status });
    if (ok) toast.success(`${m.name} is ${status}`);
  }

  async function changeLimit(m: TeamMember, dailyCallLimit: number | null) {
    const ok = await patch(m.id, { dailyCallLimit }, { dailyCallLimit });
    if (ok) {
      toast.success(
        dailyCallLimit === null
          ? `${m.name} now uses the platform default limit`
          : `${m.name} limited to ${dailyCallLimit} call${dailyCallLimit === 1 ? '' : 's'} a day`
      );
    }
  }

  async function resetPassword(m: TeamMember) {
    const d = await patch(
      m.id,
      { resetPassword: true },
      { status: 'active', mustChangePassword: true }
    );
    if (!d) return;
    setConfirm(null);
    if (d.defaultPassword) {
      setCredential({ name: m.name, email: m.email, password: d.defaultPassword, reason: 'reset' });
    }
    toast.success(`Password reset for ${m.name}`);
  }

  async function disable(m: TeamMember) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/admin/employees?id=${encodeURIComponent(m.id)}`, {
        method: 'DELETE',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || 'Could not disable this account');
        return;
      }
      setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, status: 'disabled', leads: 0 } : r)));
      setConfirm(null);
      toast.success(
        m.leads > 0
          ? `${m.name} disabled — ${m.leads} lead${m.leads === 1 ? '' : 's'} returned to the unassigned pool`
          : `${m.name} disabled`
      );
      router.refresh();
    } catch {
      toast.error('Network error — nothing was changed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or employee ID…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <InviteMember variant="secondary" />
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add employee
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
          <UserCog className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No team members yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Add someone with the default password, or email them an invitation.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add your first employee
          </button>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Search className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matches</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1120px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                  <tr className="border-b border-slate-200 dark:border-white/10 text-left">
                    <Th>Member</Th>
                    <Th>Employee ID</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Daily limit</Th>
                    <Th className="text-right">Leads</Th>
                    <Th className="text-right">Calls today</Th>
                    <Th className="text-right">Completed</Th>
                    <Th className="text-right">Interested</Th>
                    <Th className="text-right">Last seen</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {filtered.map((m) => {
                    const rate = m.completed ? Math.round((m.interested / m.completed) * 100) : null;
                    const busy = busyId === m.id;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <Td>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                              <Link
                                href={`/admin/team/${m.id}`}
                                className="truncate hover:text-brand-600 dark:hover:text-brand-400 hover:underline transition-colors"
                              >
                                {m.name}
                              </Link>
                              {m.id === currentUserId && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/5 text-slate-500">
                                  you
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3 shrink-0" /> {m.email}
                            </p>
                            {m.mustChangePassword && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                Still on the default password
                              </p>
                            )}
                          </div>
                        </Td>
                        <Td>
                          {m.employeeId ? (
                            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{m.employeeId}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <PillSelect
                            value={m.role}
                            tone={ROLE_TONE[m.role]}
                            disabled={busy}
                            label={`Role for ${m.name}`}
                            onChange={(v) => changeRole(m, v as MemberRole)}
                            options={[
                              { value: 'employee', label: 'employee' },
                              { value: 'admin', label: 'admin' },
                            ]}
                          />
                        </Td>
                        <Td>
                          <PillSelect
                            value={m.status}
                            tone={STATUS_TONE[m.status]}
                            disabled={busy}
                            label={`Status for ${m.name}`}
                            onChange={(v) => changeStatus(m, v as MemberStatus)}
                            options={[
                              { value: 'active', label: 'active' },
                              { value: 'disabled', label: 'disabled' },
                              // Only reachable through the email-invite flow, so it is shown
                              // for context but never selectable.
                              ...(m.status === 'invited'
                                ? [{ value: 'invited', label: 'invite sent', locked: true }]
                                : []),
                            ]}
                          />
                        </Td>
                        <Td className="text-right">
                          <LimitCell member={m} disabled={busy} onCommit={(v) => changeLimit(m, v)} />
                        </Td>
                        <Td className="text-right tabular-nums text-slate-700 dark:text-slate-300">{m.leads}</Td>
                        <Td className="text-right tabular-nums text-slate-700 dark:text-slate-300">{m.callsToday}</Td>
                        <Td className="text-right tabular-nums text-slate-700 dark:text-slate-300">{m.completed}</Td>
                        <Td className="text-right tabular-nums">
                          <span className="text-brand-600 dark:text-brand-400 font-medium">{m.interested}</span>
                          {rate !== null && <span className="text-xs text-slate-400 ml-1">({rate}%)</span>}
                        </Td>
                        <Td className="text-right">
                          {/* Server and client can straddle a minute boundary here. */}
                          <span
                            suppressHydrationWarning
                            className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" /> {relative(m.lastLoginAt)}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                            <Link
                              href={`/admin/team/${m.id}`}
                              title="View this member"
                              aria-label={`View ${m.name}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            <button
                              type="button"
                              title="Reset password"
                              aria-label={`Reset password for ${m.name}`}
                              disabled={busy}
                              onClick={() => setConfirm({ kind: 'reset', member: m })}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title={m.status === 'disabled' ? 'Already disabled' : 'Disable account'}
                              aria-label={`Disable ${m.name}`}
                              disabled={busy || m.status === 'disabled'}
                              onClick={() => setConfirm({ kind: 'disable', member: m })}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <AnimatePresence>
        {adding && (
          <AddEmployee
            onClose={() => setAdding(false)}
            onCreated={(c) => {
              setAdding(false);
              if (c.password) setCredential(c);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {credential && <CredentialPanel credential={credential} onClose={() => setCredential(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {confirm && (
          <Confirm
            busy={busyId === confirm.member.id}
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              confirm.kind === 'reset' ? resetPassword(confirm.member) : disable(confirm.member)
            }
            danger={confirm.kind === 'disable'}
            confirmLabel={confirm.kind === 'reset' ? 'Reset password' : 'Disable account'}
            title={
              confirm.kind === 'reset'
                ? `Reset ${confirm.member.name}'s password?`
                : `Disable ${confirm.member.name}?`
            }
          >
            {confirm.kind === 'reset' ? (
              <>
                Their current password stops working immediately. They will sign in with the shared
                default password shown next, and must choose a new one before reaching any screen.
              </>
            ) : (
              <>
                They lose access straight away and{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {confirm.member.leads} assigned lead{confirm.member.leads === 1 ? '' : 's'}
                </span>{' '}
                return to the unassigned pool for someone else to pick up. Their call history is
                kept — re-enable them any time by setting their status back to active.
              </>
            )}
          </Confirm>
        )}
      </AnimatePresence>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400', className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>;
}

function PillSelect({
  value,
  options,
  tone,
  disabled,
  label,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; locked?: boolean }[];
  tone: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'appearance-none cursor-pointer rounded-full pl-2.5 pr-6 py-1 text-[11px] font-medium',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
          tone
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.locked} className="bg-white dark:bg-[#0a1128] text-slate-900 dark:text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none opacity-60" />
    </span>
  );
}

function LimitCell({
  member,
  disabled,
  onCommit,
}: {
  member: TeamMember;
  disabled: boolean;
  onCommit: (value: number | null) => void;
}) {
  const asText = (v: number | null) => (v === null ? '' : String(v));
  const [draft, setDraft] = useState(asText(member.dailyCallLimit));

  useEffect(() => setDraft(asText(member.dailyCallLimit)), [member.dailyCallLimit]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== '' && !/^\d+$/.test(trimmed)) {
      toast.error('Daily limit must be a whole number, or blank for the default');
      setDraft(asText(member.dailyCallLimit));
      return;
    }
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === member.dailyCallLimit) return;
    onCommit(next);
  }

  return (
    <input
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      placeholder="default"
      title="Calls this person may trigger per day. Blank uses the platform default."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(asText(member.dailyCallLimit));
      }}
      className="w-24 h-8 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 text-right text-xs tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
    />
  );
}

function AddEmployee({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (credential: Credential) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', employeeId: '', role: 'employee',
    phone: '', department: '', designation: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || 'Could not create the account');
        return;
      }
      toast.success(`${form.name.trim()} can sign in now`);
      onCreated({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: String(d.defaultPassword ?? ''),
        reason: 'created',
      });
    } catch {
      toast.error('Network error — the account was not created');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Add an employee</h2>
          <button onClick={onClose} className="p-1 -mr-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          The account is created straight away with the shared default password, which you read out
          to them. No email required.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name" required>
            <input required value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Anita Sharma" className={inputClass} />
          </Field>
          <Field label="Email" required>
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              placeholder="anita@financebuddha.com" className={inputClass} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Employee ID" hint="They can sign in with this instead of their email.">
              <input value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)}
                placeholder="FB-014" className={inputClass} />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => set('role', e.target.value)} className={inputClass}>
                <option value="employee">Employee — works their assigned leads</option>
                <option value="admin">Admin — full access</option>
              </select>
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 98765 43210" className={inputClass} />
            </Field>
            <Field label="Department">
              <input value={form.department} onChange={(e) => set('department', e.target.value)}
                placeholder="Personal loans" className={inputClass} />
            </Field>
          </div>
          <Field label="Designation">
            <input value={form.designation} onChange={(e) => set('designation', e.target.value)}
              placeholder="Relationship manager" className={inputClass} />
          </Field>

          <button type="submit" disabled={busy}
            className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Create account
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CredentialPanel({
  credential,
  onClose,
}: {
  credential: Credential;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {credential.reason === 'created' ? `${credential.name} is ready to sign in` : `Password reset for ${credential.name}`}
          </h2>
          <button onClick={onClose} className="p-1 -mr-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Read this password out to them — it is not shown again.
        </p>

        <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 space-y-3">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Signs in with</p>
            <p className="text-sm font-medium text-slate-900 dark:text-white break-all">{credential.email}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Temporary password</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white break-all">
                {credential.password}
              </code>
              <CopyButton value={credential.password} />
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <BadgeCheck className="w-3.5 h-3.5 shrink-0 mt-px text-brand-600 dark:text-brand-400" />
          They will be forced to change it at first sign-in before they can reach any screen.
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full h-10 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}

function Confirm({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !busy && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
            danger ? 'bg-red-500/10' : 'bg-amber-500/10'
          )}>
            {danger
              ? <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              : <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{children}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors',
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-600 hover:bg-brand-500'
            )}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy password"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Could not copy — select the password and copy it manually');
        }
      }}
      className="shrink-0 p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/5"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const inputClass =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
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
