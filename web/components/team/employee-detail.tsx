'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, BadgeCheck, Bot, Check, Clock, Copy, FileText, Gauge,
  History, KeyRound, Loader2, LogIn, Mail, Megaphone, Phone, PhoneCall, PhoneOutgoing,
  Save, Search, ShieldCheck, TrendingUp, UserMinus, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/// Mirrors the Prisma Role enum. Widened from the original two so a role
/// added to the schema cannot silently fall through a lookup table here.
export type EmployeeRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'employee'
  | 'viewer';
export type EmployeeStatus = 'invited' | 'active' | 'disabled';

export interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  role: EmployeeRole;
  status: EmployeeStatus;
  phone: string | null;
  department: string | null;
  designation: string | null;
  dailyCallLimit: number | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface EmployeeStats {
  callsToday: number;
  calls7d: number;
  calls30d: number;
  callsAll: number;
  /** Calls with airtime — the denominator for interest rate. */
  connected: number;
  interested: number;
  connectRate: number | null;
  interestRate: number | null;
  avgDurationSec: number;
  totalTalkSec: number;
  callbacksBooked: number;
  leadsTotal: number;
  leadsByStatus: { status: string; count: number }[];
}

/**
 * Deliberately not the CallRow of components/calls/call-list: this screen shows
 * a campaign column that list does not, and keeping its own type stops a change
 * to the shared employee call list from rippling into the admin drill-down.
 */
export interface EmployeeCallRow {
  id: string;
  phone: string;
  contactName: string | null;
  agentName: string | null;
  campaignName: string | null;
  status: string;
  leadStatus: string;
  durationSec: number;
  summary: string | null;
  transcriptText: string | null;
  startedAt: string;
}

export interface CreatedAgent {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  calls: number;
  campaigns: number;
  updatedAt: string;
}

export interface CreatedCampaign {
  id: string;
  name: string;
  status: string;
  agentName: string;
  contacts: number;
  calls: number;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  /** False when another admin did this to their account. */
  byThemselves: boolean;
  createdAt: string;
}

interface Props {
  employee: EmployeeProfile;
  stats: EmployeeStats;
  calls: EmployeeCallRow[];
  agents: CreatedAgent[];
  campaigns: CreatedCampaign[];
  activity: ActivityEntry[];
  isSelf: boolean;
  activeAdminCount: number;
}

type TabId = 'access' | 'performance' | 'calls' | 'created' | 'activity';

const LEAD_TONE: Record<string, string> = {
  interested: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  callback_requested: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  not_interested: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  no_answer: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  voicemail: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  unknown: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

const CONTACT_TONE: Record<string, string> = {
  pending: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  calling: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  retry: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  exhausted: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  do_not_call: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

const CAMPAIGN_TONE: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  scheduled: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  running: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  paused: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  completed: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'password.changed': 'Changed their password',
  'invite.accepted': 'Accepted their invitation',
  'employee.created': 'Account created',
  'employee.updated': 'Account details updated',
  'employee.password_reset': 'Password reset by an admin',
  'employee.disabled': 'Account disabled',
  'agent.created': 'Created an AI agent',
  'agent.updated': 'Updated an AI agent',
  'agent.deleted': 'Deleted an AI agent',
  'campaign.created': 'Created a campaign',
  'campaign.start': 'Started a campaign',
  'campaign.pause': 'Paused a campaign',
  'campaign.resume': 'Resumed a campaign',
  'campaign.stop': 'Stopped a campaign',
  'contacts.imported': 'Imported contacts',
  'call.started': 'Placed a call',
  'call.reported': 'Call outcome recorded',
  'document.uploaded': 'Uploaded a document',
  'document.deleted': 'Deleted a document',
  'settings.updated': 'Updated platform settings',
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/[._]/g, ' ');
}

function actionIcon(action: string): LucideIcon {
  if (action.startsWith('auth.') || action === 'invite.accepted') return LogIn;
  if (action.startsWith('password.') || action === 'employee.password_reset') return KeyRound;
  if (action.startsWith('agent.')) return Bot;
  if (action.startsWith('campaign.')) return Megaphone;
  if (action.startsWith('call.')) return PhoneCall;
  if (action.startsWith('contacts.')) return Users;
  if (action.startsWith('document.')) return FileText;
  if (action.startsWith('employee.')) return ShieldCheck;
  return History;
}

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

function spoken(sec: number): string {
  if (!sec) return '0m';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.round((sec % 3600) / 60);
  return hrs ? `${hrs}h ${mins}m` : `${mins || 1}m`;
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function EmployeeDetail({
  employee, stats, calls, agents, campaigns, activity, isSelf, activeAdminCount,
}: Props) {
  const [tab, setTab] = useState<TabId>('access');

  const tabs: { id: TabId; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'access', label: 'Access', icon: ShieldCheck },
    { id: 'performance', label: 'Performance', icon: Gauge },
    { id: 'calls', label: 'Calls', icon: PhoneCall, count: calls.length },
    { id: 'created', label: 'Created', icon: Bot, count: agents.length + campaigns.length },
    { id: 'activity', label: 'Activity', icon: History, count: activity.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              tab === t.id
                ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            <t.icon className="w-4 h-4 shrink-0" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="tabular-nums text-xs opacity-70">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'access' && (
        <AccessTab
          employee={employee}
          leadCount={stats.leadsTotal}
          isSelf={isSelf}
          activeAdminCount={activeAdminCount}
        />
      )}
      {tab === 'performance' && <PerformanceTab stats={stats} />}
      {tab === 'calls' && <CallsTab calls={calls} name={employee.name} />}
      {tab === 'created' && <CreatedTab agents={agents} campaigns={campaigns} name={employee.name} />}
      {tab === 'activity' && <ActivityTab activity={activity} name={employee.name} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

function AccessTab({
  employee, leadCount, isSelf, activeAdminCount,
}: {
  employee: EmployeeProfile;
  leadCount: number;
  isSelf: boolean;
  activeAdminCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<EmployeeRole>(employee.role);
  const [status, setStatus] = useState<EmployeeStatus>(employee.status);
  const [limit, setLimit] = useState(employee.dailyCallLimit === null ? '' : String(employee.dailyCallLimit));
  const [profile, setProfile] = useState({
    name: employee.name,
    phone: employee.phone ?? '',
    department: employee.department ?? '',
    designation: employee.designation ?? '',
  });
  const [password, setPassword] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'disable' | null>(null);

  // router.refresh() re-renders the server page; adopt its values as the truth
  // so an optimistic edit that has since been persisted settles cleanly.
  useEffect(() => {
    setRole(employee.role);
    setStatus(employee.status);
    setLimit(employee.dailyCallLimit === null ? '' : String(employee.dailyCallLimit));
    setProfile({
      name: employee.name,
      phone: employee.phone ?? '',
      department: employee.department ?? '',
      designation: employee.designation ?? '',
    });
  }, [employee]);

  const lastAdmin = employee.role === 'admin' && activeAdminCount <= 1;

  async function patch(body: Record<string, unknown>): Promise<{ defaultPassword?: string } | null> {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: employee.id, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server refuses last-admin demotions and self-disables with wording
        // worth showing exactly as written.
        toast.error(d.error || 'Could not update this account');
        return null;
      }
      router.refresh();
      return d as { defaultPassword?: string };
    } catch {
      toast.error('Network error — nothing was changed');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(next: EmployeeRole) {
    if (next === role) return;
    setRole(next);
    const ok = await patch({ role: next });
    if (!ok) setRole(employee.role);
    else toast.success(`${employee.name} is now ${next === 'admin' ? 'an admin' : 'an employee'}`);
  }

  async function changeStatus(next: EmployeeStatus) {
    if (next === status) return;
    if (next === 'disabled') {
      // Disabling always goes through DELETE, which also releases their leads —
      // a status flip alone would leave the pool half-updated.
      setConfirm('disable');
      return;
    }
    setStatus(next);
    const ok = await patch({ status: next });
    if (!ok) setStatus(employee.status);
    else toast.success(`${employee.name} can sign in again`);
  }

  async function commitLimit() {
    const trimmed = limit.trim();
    if (trimmed !== '' && !/^\d+$/.test(trimmed)) {
      toast.error('Daily limit must be a whole number, or blank for the platform default');
      setLimit(employee.dailyCallLimit === null ? '' : String(employee.dailyCallLimit));
      return;
    }
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === employee.dailyCallLimit) return;
    const ok = await patch({ dailyCallLimit: next });
    if (!ok) {
      setLimit(employee.dailyCallLimit === null ? '' : String(employee.dailyCallLimit));
      return;
    }
    toast.success(
      next === null
        ? `${employee.name} now uses the platform default limit`
        : `${employee.name} limited to ${next} call${next === 1 ? '' : 's'} a day`
    );
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    const ok = await patch({
      name: profile.name.trim(),
      phone: profile.phone.trim(),
      department: profile.department.trim(),
      designation: profile.designation.trim(),
    });
    if (ok) toast.success('Profile updated');
  }

  async function resetPassword() {
    const d = await patch({ resetPassword: true });
    if (!d) return;
    setConfirm(null);
    if (d.defaultPassword) setPassword(d.defaultPassword);
    toast.success(`Password reset for ${employee.name}`);
  }

  async function disable() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/employees?id=${encodeURIComponent(employee.id)}`, {
        method: 'DELETE',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || 'Could not disable this account');
        setStatus(employee.status);
        return;
      }
      setConfirm(null);
      setStatus('disabled');
      toast.success(
        leadCount > 0
          ? `${employee.name} disabled — ${leadCount} lead${leadCount === 1 ? '' : 's'} returned to the unassigned pool`
          : `${employee.name} disabled`
      );
      router.refresh();
    } catch {
      toast.error('Network error — nothing was changed');
      setStatus(employee.status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {password && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.05] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Temporary password for {employee.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Read it out to them — it is not shown again.
                </p>
              </div>
              <button
                onClick={() => setPassword(null)}
                aria-label="Dismiss password"
                className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="font-mono text-lg font-semibold tracking-wide text-slate-900 dark:text-white break-all">
                {password}
              </code>
              <CopyButton value={password} />
            </div>

            <p className="mt-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <BadgeCheck className="w-3.5 h-3.5 shrink-0 mt-px text-brand-600 dark:text-brand-400" />
              They sign in with {employee.email} and must choose a new password before reaching any
              screen.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <Panel title="Sign-in details" hint="How this person reaches the platform.">
            <dl className="space-y-3">
              <Row icon={Mail} label="Email">{employee.email}</Row>
              <Row icon={BadgeCheck} label="Employee ID">
                {employee.employeeId ? (
                  <span className="font-mono text-xs">{employee.employeeId}</span>
                ) : (
                  <span className="text-slate-400">not set — signs in with email only</span>
                )}
              </Row>
              <Row icon={Phone} label="Phone">{employee.phone || <span className="text-slate-400">—</span>}</Row>
              <Row icon={Clock} label="Last sign-in">
                <span suppressHydrationWarning>
                  {employee.lastLoginAt
                    ? `${dateTime(employee.lastLoginAt)} · ${relative(employee.lastLoginAt)}`
                    : 'never signed in'}
                </span>
              </Row>
              <Row icon={Users} label="Account created">
                <span suppressHydrationWarning>{dateTime(employee.createdAt)}</span>
              </Row>
              <Row icon={KeyRound} label="Password">
                {employee.mustChangePassword ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Still on the admin-assigned default
                  </span>
                ) : (
                  'Chosen by the employee'
                )}
              </Row>
            </dl>
          </Panel>

          <Panel title="Profile" hint="Shown across the platform wherever this person appears.">
            <form onSubmit={saveProfile} className="space-y-4">
              <Field label="Full name" required>
                <input
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Phone">
                  <input
                    value={profile.phone}
                    onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                    className={inputClass}
                  />
                </Field>
                <Field label="Department">
                  <input
                    value={profile.department}
                    onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))}
                    placeholder="Personal loans"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Designation">
                <input
                  value={profile.designation}
                  onChange={(e) => setProfile((p) => ({ ...p, designation: e.target.value }))}
                  placeholder="Relationship manager"
                  className={inputClass}
                />
              </Field>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save profile
              </button>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Access" hint="What this account may do, and whether it may sign in at all.">
            <div className="space-y-5">
              <Field
                label="Role"
                hint={
                  role === 'admin'
                    ? 'Admins see every agent, campaign, lead and call, plus team and settings.'
                    : 'Employees run their own agents and campaigns over their own leads only.'
                }
              >
                <select
                  value={role}
                  disabled={busy}
                  onChange={(e) => changeRole(e.target.value as EmployeeRole)}
                  className={inputClass}
                >
                  <option value="employee">Employee — works their own leads</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </Field>
              {lastAdmin && (
                <Note tone="amber">
                  This is the only active admin. Promote someone else before changing this.
                </Note>
              )}

              <Field
                label="Status"
                hint="Disabled accounts are signed out immediately and cannot sign back in."
              >
                <select
                  value={status}
                  disabled={busy}
                  onChange={(e) => changeStatus(e.target.value as EmployeeStatus)}
                  className={inputClass}
                >
                  <option value="active">Active — may sign in</option>
                  <option value="disabled">Disabled — no access</option>
                  {/* Only reachable through the email-invite flow, so it is shown
                      for context but never selectable. */}
                  {status === 'invited' && (
                    <option value="invited" disabled>
                      Invite sent — waiting for them to set a password
                    </option>
                  )}
                </select>
              </Field>

              <Field
                label="Daily call limit"
                hint="Calls this person may trigger per day. Blank uses the platform default."
              >
                <div className="flex items-center gap-2">
                  <input
                    value={limit}
                    disabled={busy}
                    inputMode="numeric"
                    placeholder="default"
                    onChange={(e) => setLimit(e.target.value)}
                    onBlur={commitLimit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        setLimit(employee.dailyCallLimit === null ? '' : String(employee.dailyCallLimit));
                      }
                    }}
                    className={cn(inputClass, 'max-w-[10rem] tabular-nums')}
                  />
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
              </Field>
            </div>
          </Panel>

          <Panel title="Password" hint="Hand back the shared default when someone is locked out.">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm('reset')}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              <KeyRound className="w-4 h-4" /> Reset password
            </button>
          </Panel>

          <Panel title="Disable account" tone="danger" hint="Access is revoked straight away. Nothing is deleted.">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Their {leadCount} assigned lead{leadCount === 1 ? '' : 's'} return to the unassigned
              pool for someone else to pick up. Calls, agents and campaigns they created are kept —
              set their status back to active to restore access.
            </p>
            {isSelf && <Note tone="amber">You cannot disable your own account.</Note>}
            {lastAdmin && !isSelf && (
              <Note tone="amber">This is the only active admin. Promote someone else first.</Note>
            )}
            <button
              type="button"
              disabled={busy || status === 'disabled'}
              onClick={() => setConfirm('disable')}
              className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              <UserMinus className="w-4 h-4" />
              {status === 'disabled' ? 'Already disabled' : 'Disable account'}
            </button>
          </Panel>
        </div>
      </div>

      <AnimatePresence>
        {confirm && (
          <Confirm
            busy={busy}
            danger={confirm === 'disable'}
            confirmLabel={confirm === 'reset' ? 'Reset password' : 'Disable account'}
            title={
              confirm === 'reset'
                ? `Reset ${employee.name}'s password?`
                : `Disable ${employee.name}?`
            }
            onCancel={() => {
              setConfirm(null);
              setStatus(employee.status);
            }}
            onConfirm={() => (confirm === 'reset' ? resetPassword() : disable())}
          >
            {confirm === 'reset' ? (
              <>
                Their current password stops working immediately. They will sign in with the shared
                default password shown next, and must choose a new one before reaching any screen.
              </>
            ) : (
              <>
                They lose access straight away and{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {leadCount} assigned lead{leadCount === 1 ? '' : 's'}
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

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

function PerformanceTab({ stats }: { stats: EmployeeStats }) {
  const cards: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
    { label: 'Calls today', value: String(stats.callsToday), icon: PhoneCall, tone: 'text-blue-500 bg-blue-500/10' },
    { label: 'Last 7 days', value: String(stats.calls7d), icon: PhoneOutgoing, tone: 'text-sky-500 bg-sky-500/10' },
    { label: 'Last 30 days', value: String(stats.calls30d), icon: PhoneOutgoing, tone: 'text-indigo-500 bg-indigo-500/10' },
    { label: 'All time', value: String(stats.callsAll), icon: History, tone: 'text-slate-500 bg-slate-500/10' },
    {
      label: 'Connect rate',
      value: stats.connectRate === null ? '—' : `${stats.connectRate}%`,
      icon: TrendingUp,
      tone: 'text-brand-500 bg-brand-500/10',
    },
    {
      label: 'Interested',
      value: stats.interestRate === null ? '—' : `${stats.interestRate}%`,
      icon: TrendingUp,
      tone: 'text-purple-500 bg-purple-500/10',
    },
    { label: 'Avg duration', value: clock(stats.avgDurationSec), icon: Clock, tone: 'text-amber-500 bg-amber-500/10' },
    { label: 'Talk time', value: spoken(stats.totalTalkSec), icon: Clock, tone: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Callbacks booked', value: String(stats.callbacksBooked), icon: Clock, tone: 'text-rose-500 bg-rose-500/10' },
    { label: 'Leads assigned', value: String(stats.leadsTotal), icon: Users, tone: 'text-cyan-500 bg-cyan-500/10' },
  ];

  const busiest = stats.leadsByStatus.length
    ? Math.max(...stats.leadsByStatus.map((s) => s.count))
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4"
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', c.tone)}>
              <c.icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{c.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Panel
          title="Leads by status"
          hint={`${stats.leadsTotal} lead${stats.leadsTotal === 1 ? '' : 's'} currently assigned`}
        >
          {stats.leadsByStatus.length === 0 ? (
            <div className="py-6 text-center">
              <Users className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No leads assigned</p>
              <p className="text-xs text-slate-500 mt-1">
                Assign leads from the contacts screen and they will show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {stats.leadsByStatus.map((s) => (
                <li key={s.status}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-medium',
                        CONTACT_TONE[s.status] ?? CONTACT_TONE.pending
                      )}
                    >
                      {s.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {s.count}
                      <span className="text-slate-400 ml-1">
                        ({stats.leadsTotal ? Math.round((s.count / stats.leadsTotal) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${busiest ? Math.max(4, (s.count / busiest) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Calling record" hint="Every call on their leads, plus any they placed themselves.">
          <dl className="space-y-3">
            <Row icon={PhoneCall} label="Calls placed">{stats.callsAll}</Row>
            <Row icon={PhoneOutgoing} label="Answered">
              {stats.connected}
              {stats.connectRate !== null && (
                <span className="text-slate-400 ml-1">({stats.connectRate}% of dials)</span>
              )}
            </Row>
            <Row icon={TrendingUp} label="Interested leads">
              <span className="text-brand-600 dark:text-brand-400 font-medium">{stats.interested}</span>
              {stats.interestRate !== null && (
                <span className="text-slate-400 ml-1">({stats.interestRate}% of answered)</span>
              )}
            </Row>
            <Row icon={Clock} label="Total talk time">{spoken(stats.totalTalkSec)}</Row>
            <Row icon={Clock} label="Average call">{clock(stats.avgDurationSec)}</Row>
            <Row icon={Clock} label="Callbacks booked">{stats.callbacksBooked}</Row>
          </dl>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

function CallsTab({ calls, name }: { calls: EmployeeCallRow[]; name: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<EmployeeCallRow | null>(null);

  const filtered = calls.filter((c) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (c.contactName ?? '').toLowerCase().includes(t) ||
      c.phone.includes(t) ||
      (c.campaignName ?? '').toLowerCase().includes(t) ||
      (c.agentName ?? '').toLowerCase().includes(t)
    );
  });

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, agent or campaign…"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <PhoneCall className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {calls.length === 0 ? 'No calls yet' : 'No matches'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {calls.length === 0
                ? `Calls appear here once ${name} starts dialling or a campaign reaches their leads.`
                : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                  <th className="px-4 py-3 font-medium text-right">When</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{c.contactName || c.phone}</p>
                      {c.contactName && <p className="text-xs text-slate-500">{c.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.agentName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {c.campaignName || <span className="text-slate-400">Manual dial</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium',
                          LEAD_TONE[c.leadStatus] ?? LEAD_TONE.unknown
                        )}
                      >
                        {c.leadStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {clock(c.durationSec)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {new Date(c.startedAt).toLocaleString([], {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setOpen(c)}
                        className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail side panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(null)}
          >
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-[#0a1128] border-l border-slate-200 dark:border-white/10 overflow-y-auto"
            >
              <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate">
                    {open.contactName || open.phone}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {open.phone} · {dateTime(open.startedAt)}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(null)}
                  aria-label="Close call details"
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Outcome" value={open.leadStatus.replace(/_/g, ' ')} />
                  <MiniStat label="Duration" value={clock(open.durationSec)} />
                  <MiniStat label="Status" value={open.status.replace(/_/g, ' ')} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Agent" value={open.agentName || '—'} />
                  <MiniStat label="Campaign" value={open.campaignName || 'Manual dial'} />
                </div>

                {open.summary ? (
                  <PanelSection icon={FileText} title="AI summary">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{open.summary}</p>
                  </PanelSection>
                ) : (
                  <PanelSection icon={FileText} title="AI summary">
                    <p className="text-sm text-slate-400">No summary was produced for this call.</p>
                  </PanelSection>
                )}

                {open.transcriptText && (
                  <PanelSection icon={Clock} title="Transcript">
                    <div className="space-y-2">
                      {open.transcriptText.split('\n').map((line, i) => {
                        const isCustomer = line.startsWith('Customer:');
                        return (
                          <div key={i} className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
                            <div
                              className={cn(
                                'max-w-[80%] px-3 py-2 rounded-2xl text-sm',
                                isCustomer
                                  ? 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                                  : 'bg-brand-500/10 text-brand-800 dark:text-brand-200 rounded-tr-sm'
                              )}
                            >
                              {line.replace(/^(Customer|Agent):\s*/, '')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PanelSection>
                )}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Created
// ---------------------------------------------------------------------------

function CreatedTab({
  agents, campaigns, name,
}: {
  agents: CreatedAgent[];
  campaigns: CreatedCampaign[];
  name: string;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          AI agents{' '}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {agents.length} authored by {name}
          </span>
        </h2>

        {agents.length === 0 ? (
          <EmptyBlock icon={Bot} title="No agents authored" hint={`${name} has not built an AI agent yet.`} />
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/agents/${a.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 hover:border-brand-500/40 dark:hover:border-brand-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-medium',
                        a.isActive
                          ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                      )}
                    >
                      {a.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {a.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[2rem]">
                    {a.description || 'No description'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-auto pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5" />{a.calls} calls
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5" />{a.campaigns}
                    </span>
                    <span suppressHydrationWarning className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />{relative(a.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          Campaigns{' '}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {campaigns.length} started by {name}
          </span>
        </h2>

        {campaigns.length === 0 ? (
          <EmptyBlock icon={Megaphone} title="No campaigns" hint={`${name} has not run a campaign yet.`} />
        ) : (
          <ul className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] divide-y divide-slate-100 dark:divide-white/[0.06] overflow-hidden">
            {campaigns.map((c) => (
              <li key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <Link href="/admin/campaigns" className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {c.agentName} · {c.contacts} contact{c.contacts === 1 ? '' : 's'} · {c.calls} call
                      {c.calls === 1 ? '' : 's'} · created {dateTime(c.createdAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
                      CAMPAIGN_TONE[c.status] ?? CAMPAIGN_TONE.draft
                    )}
                  >
                    {c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityTab({ activity, name }: { activity: ActivityEntry[]; name: string }) {
  if (activity.length === 0) {
    return (
      <EmptyBlock
        icon={History}
        title="Nothing recorded yet"
        hint={`Sign-ins and actions appear here as soon as ${name} uses the platform.`}
      />
    );
  }

  return (
    <ul className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] divide-y divide-slate-100 dark:divide-white/[0.06] overflow-hidden">
      {activity.map((a) => {
        const Icon = actionIcon(a.action);
        const scope = a.entity === 'User' ? 'account' : a.entity.toLowerCase();
        // A deleted agent has no page left to open, so it stays plain text.
        const href =
          a.entity === 'Agent' && a.entityId && a.action !== 'agent.deleted'
            ? `/admin/agents/${a.entityId}`
            : null;

        return (
          <li key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02]">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {href ? (
                  <Link href={href} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                    {actionLabel(a.action)}
                  </Link>
                ) : (
                  actionLabel(a.action)
                )}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {a.byThemselves ? scope : `${scope} · by ${a.actorName ?? 'a removed account'}`}
              </p>
            </div>
            <span
              suppressHydrationWarning
              title={dateTime(a.createdAt)}
              className="shrink-0 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1"
            >
              <Clock className="w-3 h-3" /> {relative(a.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const inputClass =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

function Panel({
  title, hint, tone, children,
}: {
  title: string;
  hint?: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border bg-white dark:bg-white/[0.03] p-5',
        tone === 'danger' ? 'border-red-200 dark:border-red-500/20' : 'border-slate-200 dark:border-white/10'
      )}
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PanelSection({
  icon: Icon, title, children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
        <Icon className="w-3.5 h-3.5" /> {label}
      </dt>
      <dd className="text-sm text-slate-700 dark:text-slate-200 text-right break-words min-w-0">
        {children}
      </dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize truncate">{value}</p>
    </div>
  );
}

function Note({ tone, children }: { tone: 'amber'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'mt-3 flex items-start gap-2 text-xs leading-relaxed',
        tone === 'amber' && 'text-amber-600 dark:text-amber-400'
      )}
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{children}</span>
    </p>
  );
}

function EmptyBlock({
  icon: Icon, title, hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-14 text-center">
      <Icon className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
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

function Confirm({
  title, children, confirmLabel, danger, busy, onConfirm, onCancel,
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
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
              danger ? 'bg-red-500/10' : 'bg-amber-500/10'
            )}
          >
            {danger ? (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
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
      {copied ? (
        <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
