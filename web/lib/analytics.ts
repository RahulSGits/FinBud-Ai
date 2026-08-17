// Calling analytics: totals, a daily series, and per-employee / per-agent
// breakdowns.
//
// Two entry points, one set of internals:
//   • computeAnalytics(query)          — company-wide, admin only.
//   • computeMyAnalytics(userId, query) — one person's own record.
// Both are assembled from the same helpers below, so an employee reading their
// connect rate and an admin reading the same person's row can never disagree.
//
// This lives in lib/ rather than inside app/api/analytics/route.ts because a
// Next.js route module may only export the HTTP verbs and a fixed set of
// segment options — any extra export fails the build's route type check. Both
// the route handlers and the server-rendered pages import from here, so the
// first paint and every later refetch are produced by the same code and cannot
// drift apart.
//
// Everything is computed with grouped queries. The one deliberate exception is
// the daily series: Prisma cannot group by a truncated date, and doing it in
// SQL would bucket calls by the *database session's* timezone, which is not the
// same "day" the rest of the app means when it says `setHours(0, 0, 0, 0)`. A
// single narrow projection bucketed in JS keeps one definition of a day.
import { CallStatus, ContactStatus, LeadStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;

/** Ranges offered by the dashboard's date-range control. */
export const RANGE_OPTIONS = [7, 30, 90] as const;

export interface AnalyticsQuery {
  days: number;
  employeeId: string | null;
  agentId: string | null;
  /**
   * The tenant these figures describe.
   *
   * Required, and first in every predicate below. Null means the platform
   * owner looking across all companies — which is a deliberate act, not a
   * default, so it has to be passed explicitly rather than arrived at by
   * forgetting. Making it a required field means a caller that omits it does
   * not compile.
   */
  companyId: string | null;
}

/** The scoped variant takes no employee/agent filter — the scope *is* the user. */
export interface MyAnalyticsQuery {
  days: number;
}

export interface AnalyticsTotals {
  calls: number;
  connected: number;
  interested: number;
  avgDurationSec: number;
  totalTalkTimeSec: number;
  contactsReached: number;
  /** Percentage of dials that produced a conversation. */
  connectRate: number;
  /** Percentage of *connected* calls flagged interested. */
  interestRate: number;
}

export interface DailyPoint {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  calls: number;
  connected: number;
  interested: number;
}

export interface EmployeeStat {
  id: string;
  name: string;
  employeeId: string | null;
  role: Role;
  calls: number;
  connected: number;
  interested: number;
  connectRate: number;
  interestRate: number;
  avgDurationSec: number;
  totalTalkTimeSec: number;
  leadsAssigned: number;
  callbacksBooked: number;
  lastLoginAt: string | null;
}

export interface AgentStat {
  id: string;
  name: string;
  isActive: boolean;
  calls: number;
  connected: number;
  interested: number;
  connectRate: number;
  interestRate: number;
  avgDurationSec: number;
  outcomes: Record<LeadStatus, number>;
}

export interface OutcomeSlice {
  status: LeadStatus;
  count: number;
}

/** Pipeline state of the leads assigned to one person, right now. */
export interface LeadStatusSlice {
  status: ContactStatus;
  count: number;
}

/**
 * Connect rate for one weekday / part-of-day cell.
 *
 * The question this answers is "when should we be dialling", so the measure is
 * the share of attempts that reached a human — not raw volume, which mostly
 * reflects when somebody happened to press Start.
 */
export interface TimeSlot {
  /** 0 = Sunday, matching Date#getDay. */
  weekday: number;
  /** Index into SLOT_LABELS. */
  slot: number;
  calls: number;
  connected: number;
  /** Percentage, 0 when nothing was attempted in this cell. */
  connectRate: number;
}

/** Where dials fall away, from attempt to finished conversation. */
export interface FunnelStage {
  key: 'attempted' | 'connected' | 'completed';
  label: string;
  count: number;
  /** Share of the first stage. */
  ofTotal: number;
  /** Share of the stage immediately before, which is where drop-off shows. */
  ofPrevious: number;
}

export interface AnalyticsPayload {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  employeeId: string | null;
  agentId: string | null;
  totals: AnalyticsTotals;
  daily: DailyPoint[];
  byEmployee: EmployeeStat[];
  byAgent: AgentStat[];
  outcomes: OutcomeSlice[];
  /** Connect rate by weekday and part of day. */
  bestTime: TimeSlot[];
  /** Attempted -> connected -> completed. */
  funnel: FunnelStage[];
}

/**
 * One person's own record.
 *
 * Same shape as AnalyticsPayload minus `byEmployee`, which is meaningless for a
 * single person: their row is `me` instead. `byAgent` is narrowed to the agents
 * they actually dialled with, rather than every agent the company owns.
 */
export interface MyAnalyticsPayload {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  userId: string;
  totals: AnalyticsTotals;
  daily: DailyPoint[];
  byAgent: AgentStat[];
  outcomes: OutcomeSlice[];
  /** The caller's own row, in the same shape the admin table renders. */
  me: EmployeeStat;
  leadsByStatus: LeadStatusSlice[];
  /** Callbacks this person scheduled inside the range. Mirrors `me.callbacksBooked`. */
  callbacksBooked: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Percentage with one decimal, and 0 rather than NaN for an empty denominator. */
function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function startOfDay(at: Date): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** First instant of the range: midnight, `days - 1` days back, so today counts. */
function rangeStart(now: Date, days: number): Date {
  const from = startOfDay(now);
  from.setDate(from.getDate() - (days - 1));
  return from;
}

/** Local calendar day key. Deliberately not toISOString(), which is UTC. */
function dayKey(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

function emptyOutcomes(): Record<LeadStatus, number> {
  const out = {} as Record<LeadStatus, number>;
  for (const status of Object.values(LeadStatus)) out[status] = 0;
  return out;
}

/** Read and clamp the `days` a client may send. */
export function parseDays(params: URLSearchParams): number {
  const requested = Number(params.get('days'));
  return Number.isFinite(requested) && requested >= 1
    ? Math.min(Math.floor(requested), MAX_DAYS)
    : DEFAULT_DAYS;
}

/**
 * Read and clamp the query string a client may send.
 *
 * `companyId` is a separate argument on purpose, and never read from the URL.
 * A tenant taken from the request is a tenant the caller chooses, which is the
 * whole attack: ?companyId=<someone else> would otherwise be a working way to
 * read another company's figures.
 */
export function parseAnalyticsQuery(
  params: URLSearchParams,
  companyId: string | null
): AnalyticsQuery {
  const employeeId = (params.get('employeeId') ?? '').trim();
  const agentId = (params.get('agentId') ?? '').trim();

  return {
    days: parseDays(params),
    employeeId: employeeId || null,
    agentId: agentId || null,
    companyId,
  };
}

interface Tally {
  calls: number;
  connected: number;
  interested: number;
  talkTime: number;
}

function newTally(): Tally {
  return { calls: 0, connected: 0, interested: 0, talkTime: 0 };
}

/**
 * The single attribution rule, used by the admin `employeeId` filter, by the
 * byEmployee breakdown and by computeMyAnalytics: the person who dialled when
 * we know them, the lead's owner otherwise (campaign calls carry no operator).
 */
function attributedTo(userId: string): Prisma.CallWhereInput {
  return {
    OR: [
      { startedById: userId },
      { startedById: null, contact: { assignedToId: userId } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Shared aggregation blocks
//
// Each takes the call-scope `base` — an array of AND-ed where fragments — so
// the company-wide and single-person paths differ only in what they put in it.
// ---------------------------------------------------------------------------

interface CoreAggregates {
  totals: AnalyticsTotals;
  daily: DailyPoint[];
  outcomes: OutcomeSlice[];
}

async function computeCore(
  base: Prisma.CallWhereInput[],
  from: Date,
  days: number
): Promise<CoreAggregates> {
  const where: Prisma.CallWhereInput = { AND: base };
  const connectedOnly: Prisma.CallWhereInput = { AND: [...base, { durationSec: { gt: 0 } }] };
  const interestedOnly: Prisma.CallWhereInput = { AND: [...base, { interested: true }] };

  const [overall, connectedAgg, interestedCount, reachedRows, outcomeRows, dailyRows] =
    await Promise.all([
      db.call.aggregate({ where, _count: true, _sum: { durationSec: true } }),
      db.call.aggregate({ where: connectedOnly, _count: true, _avg: { durationSec: true } }),
      db.call.count({ where: interestedOnly }),
      db.call.groupBy({
        by: ['contactId'],
        where: { AND: [...base, { durationSec: { gt: 0 } }, { contactId: { not: null } }] },
        _count: true,
      }),
      db.call.groupBy({ by: ['leadStatus'], where, _count: true }),
      // Only the three columns the trend needs — see the note at the top.
      db.call.findMany({ where, select: { startedAt: true, durationSec: true, interested: true } }),
    ]);

  const calls = overall._count;
  const connected = connectedAgg._count;

  const totals: AnalyticsTotals = {
    calls,
    connected,
    interested: interestedCount,
    avgDurationSec: Math.round(connectedAgg._avg?.durationSec ?? 0),
    totalTalkTimeSec: overall._sum?.durationSec ?? 0,
    contactsReached: reachedRows.length,
    connectRate: rate(connected, calls),
    interestRate: rate(interestedCount, connected),
  };

  // Seed every day in the range first so the chart has no gaps.
  const buckets = new Map<string, DailyPoint>();
  for (let i = 0; i < days; i++) {
    const day = new Date(from);
    day.setDate(from.getDate() + i);
    const key = dayKey(day);
    buckets.set(key, { date: key, calls: 0, connected: 0, interested: 0 });
  }
  for (const call of dailyRows) {
    const bucket = buckets.get(dayKey(call.startedAt));
    if (!bucket) continue; // a row timestamped past the end of the range
    bucket.calls += 1;
    if (call.durationSec > 0) bucket.connected += 1;
    if (call.interested) bucket.interested += 1;
  }

  const outcomeTotals = emptyOutcomes();
  for (const row of outcomeRows) outcomeTotals[row.leadStatus] += row._count;

  const outcomes: OutcomeSlice[] = Object.values(LeadStatus)
    .map((status) => ({ status, count: outcomeTotals[status] }))
    .sort((a, b) => b.count - a.count);

  return { totals, daily: Array.from(buckets.values()), outcomes };
}

interface AgentAggregates {
  tallies: Map<string, Tally>;
  outcomes: Map<string, Record<LeadStatus, number>>;
}

async function aggregateByAgent(base: Prisma.CallWhereInput[]): Promise<AgentAggregates> {
  const agentScoped: Prisma.CallWhereInput[] = [...base, { agentId: { not: null } }];

  const [totalRows, connectedRows, interestedRows, outcomeRows] = await Promise.all([
    db.call.groupBy({
      by: ['agentId'],
      where: { AND: agentScoped },
      _count: true,
      _sum: { durationSec: true },
    }),
    db.call.groupBy({
      by: ['agentId'],
      where: { AND: [...agentScoped, { durationSec: { gt: 0 } }] },
      _count: true,
    }),
    db.call.groupBy({
      by: ['agentId'],
      where: { AND: [...agentScoped, { interested: true }] },
      _count: true,
    }),
    db.call.groupBy({ by: ['agentId', 'leadStatus'], where: { AND: agentScoped }, _count: true }),
  ]);

  const tallies = new Map<string, Tally>();
  const outcomes = new Map<string, Record<LeadStatus, number>>();

  function tallyFor(agentId: string): Tally {
    const existing = tallies.get(agentId);
    if (existing) return existing;
    const fresh = newTally();
    tallies.set(agentId, fresh);
    return fresh;
  }

  for (const row of totalRows) {
    if (!row.agentId) continue;
    const tally = tallyFor(row.agentId);
    tally.calls += row._count;
    tally.talkTime += row._sum?.durationSec ?? 0;
  }
  for (const row of connectedRows) {
    if (row.agentId) tallyFor(row.agentId).connected += row._count;
  }
  for (const row of interestedRows) {
    if (row.agentId) tallyFor(row.agentId).interested += row._count;
  }
  for (const row of outcomeRows) {
    if (!row.agentId) continue;
    const mix = outcomes.get(row.agentId) ?? emptyOutcomes();
    mix[row.leadStatus] += row._count;
    outcomes.set(row.agentId, mix);
  }

  return { tallies, outcomes };
}

interface AgentRow {
  id: string;
  name: string;
  isActive: boolean;
}

function toAgentStats(agents: AgentRow[], agg: AgentAggregates): AgentStat[] {
  return agents
    .map((a) => {
      const tally = agg.tallies.get(a.id) ?? newTally();
      return {
        id: a.id,
        name: a.name,
        isActive: a.isActive,
        calls: tally.calls,
        connected: tally.connected,
        interested: tally.interested,
        connectRate: rate(tally.connected, tally.calls),
        interestRate: rate(tally.interested, tally.connected),
        avgDurationSec: tally.connected ? Math.round(tally.talkTime / tally.connected) : 0,
        outcomes: agg.outcomes.get(a.id) ?? emptyOutcomes(),
      };
    })
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
}

/**
 * Per-employee rows. Company-wide only — the scoped path derives its single row
 * from the totals, which are already filtered to that person.
 */
// NOTE: takes companyId so the roster it builds is the caller's own staff.
async function computeEmployeeStats(
  base: Prisma.CallWhereInput[],
  from: Date,
  employeeId: string | null,
  /**
   * The tenant. The call aggregates below inherit it through `base`, but the
   * staff roster, the contact-owner map and the callback counts are separate
   * queries against separate tables — and each was reading every company's
   * rows, which put other companies' staff on this company's leaderboard.
   */
  companyId: string | null
): Promise<EmployeeStat[]> {
  const scope = companyId ? { companyId } : {};
  // Calls that carry an operator, and campaign calls that do not — the two
  // halves of the attribution rule, each aggregated in one grouped query.
  const attributed: Prisma.CallWhereInput[] = [...base, { startedById: { not: null } }];
  const unattributed: Prisma.CallWhereInput[] = [
    ...base,
    { startedById: null },
    { contactId: { not: null } },
  ];

  const [
    startedTotals,
    startedConnected,
    startedInterested,
    ownedTotals,
    ownedConnected,
    ownedInterested,
    contactOwners,
    users,
    callbackRows,
  ] = await Promise.all([
    db.call.groupBy({
      by: ['startedById'],
      where: { AND: attributed },
      _count: true,
      _sum: { durationSec: true },
    }),
    db.call.groupBy({
      by: ['startedById'],
      where: { AND: [...attributed, { durationSec: { gt: 0 } }] },
      _count: true,
    }),
    db.call.groupBy({
      by: ['startedById'],
      where: { AND: [...attributed, { interested: true }] },
      _count: true,
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { AND: unattributed },
      _count: true,
      _sum: { durationSec: true },
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { AND: [...unattributed, { durationSec: { gt: 0 } }] },
      _count: true,
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { AND: [...unattributed, { interested: true }] },
      _count: true,
    }),
    db.contact.findMany({ where: scope, select: { id: true, assignedToId: true } }),
    db.user.findMany({
      where: {
        ...scope,
        status: UserStatus.active,
        ...(employeeId ? { id: employeeId } : {}),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        employeeId: true,
        role: true,
        lastLoginAt: true,
        _count: { select: { assignedContacts: true } },
      },
    }),
    db.note.groupBy({
      by: ['authorId'],
      where: {
        ...scope,
        callbackAt: { not: null },
        createdAt: { gte: from },
        ...(employeeId ? { authorId: employeeId } : {}),
      },
      _count: true,
    }),
  ]);

  const ownerOf = new Map(contactOwners.map((c) => [c.id, c.assignedToId]));
  const perUser = new Map<string, Tally>();

  function tallyFor(userId: string): Tally {
    const existing = perUser.get(userId);
    if (existing) return existing;
    const fresh = newTally();
    perUser.set(userId, fresh);
    return fresh;
  }

  for (const row of startedTotals) {
    if (!row.startedById) continue;
    const tally = tallyFor(row.startedById);
    tally.calls += row._count;
    tally.talkTime += row._sum?.durationSec ?? 0;
  }
  for (const row of startedConnected) {
    if (row.startedById) tallyFor(row.startedById).connected += row._count;
  }
  for (const row of startedInterested) {
    if (row.startedById) tallyFor(row.startedById).interested += row._count;
  }

  for (const row of ownedTotals) {
    const owner = row.contactId ? ownerOf.get(row.contactId) : null;
    if (!owner) continue;
    const tally = tallyFor(owner);
    tally.calls += row._count;
    tally.talkTime += row._sum?.durationSec ?? 0;
  }
  for (const row of ownedConnected) {
    const owner = row.contactId ? ownerOf.get(row.contactId) : null;
    if (owner) tallyFor(owner).connected += row._count;
  }
  for (const row of ownedInterested) {
    const owner = row.contactId ? ownerOf.get(row.contactId) : null;
    if (owner) tallyFor(owner).interested += row._count;
  }

  const callbacksBy = new Map<string, number>();
  for (const row of callbackRows) {
    if (row.authorId) callbacksBy.set(row.authorId, row._count);
  }

  return users
    .map((u) => {
      const tally = perUser.get(u.id) ?? newTally();
      return {
        id: u.id,
        name: u.name,
        employeeId: u.employeeId,
        role: u.role,
        calls: tally.calls,
        connected: tally.connected,
        interested: tally.interested,
        connectRate: rate(tally.connected, tally.calls),
        interestRate: rate(tally.interested, tally.connected),
        avgDurationSec: tally.connected ? Math.round(tally.talkTime / tally.connected) : 0,
        totalTalkTimeSec: tally.talkTime,
        leadsAssigned: u._count.assignedContacts,
        callbacksBooked: callbacksBy.get(u.id) ?? 0,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Company-wide (admin)
// ---------------------------------------------------------------------------


/** Part-of-day buckets, in the order they should read across a chart. */
export const SLOT_LABELS = ['Morning 6–12', 'Afternoon 12–5', 'Evening 5–9', 'Night 9–12'] as const;

/** Which bucket an hour falls in. Anything before 06:00 counts as night. */
function slotOf(hour: number): number {
  if (hour >= 6 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  if (hour >= 17 && hour < 21) return 2;
  return 3;
}

/**
 * Connect rate by weekday and part of day.
 *
 * Answers "when should we be dialling" rather than "when did we dial", so the
 * measure is the share of attempts that reached a human. Volume alone would
 * only show when somebody happened to press Start.
 *
 * Every cell is emitted, including empty ones: a grid with holes in it reads as
 * missing data, when the honest reading is "nothing was tried then".
 */
function bestTimeFrom(calls: { startedAt: Date; durationSec: number | null }[]): TimeSlot[] {
  const grid = new Map<string, { calls: number; connected: number }>();
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let slot = 0; slot < SLOT_LABELS.length; slot++) {
      grid.set(`${weekday}:${slot}`, { calls: 0, connected: 0 });
    }
  }

  for (const call of calls) {
    const key = `${call.startedAt.getDay()}:${slotOf(call.startedAt.getHours())}`;
    const cell = grid.get(key);
    if (!cell) continue;
    cell.calls++;
    if ((call.durationSec ?? 0) > 0) cell.connected++;
  }

  const out: TimeSlot[] = [];
  for (const [key, cell] of Array.from(grid.entries())) {
    const [weekday, slot] = key.split(':').map(Number);
    out.push({
      weekday,
      slot,
      calls: cell.calls,
      connected: cell.connected,
      connectRate: cell.calls ? Math.round((cell.connected / cell.calls) * 1000) / 10 : 0,
    });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.slot - b.slot);
}

/**
 * Where dials fall away.
 *
 * `ofPrevious` is the number that matters: 86% of attempts connecting is a
 * telephony story, while 86% of *connected* calls completing is a conversation
 * story, and they need different fixes.
 */
function funnelFrom(totals: AnalyticsTotals, completed: number): FunnelStage[] {
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const attempted = totals.calls;
  return [
    { key: 'attempted', label: 'Attempted', count: attempted, ofTotal: 100, ofPrevious: 100 },
    {
      key: 'connected', label: 'Connected', count: totals.connected,
      ofTotal: pct(totals.connected, attempted), ofPrevious: pct(totals.connected, attempted),
    },
    {
      key: 'completed', label: 'Completed', count: completed,
      ofTotal: pct(completed, attempted), ofPrevious: pct(completed, totals.connected),
    },
  ];
}

export async function computeAnalytics(query: AnalyticsQuery): Promise<AnalyticsPayload> {
  const now = new Date();
  const from = rangeStart(now, query.days);

  const base: Prisma.CallWhereInput[] = [{ startedAt: { gte: from } }];
  // Tenant first. Every aggregate below composes this array, so scoping here
  // scopes all of them — totals, the daily series, the funnel, the heatmap and
  // both breakdowns — rather than each remembering separately.
  if (query.companyId) base.push({ companyId: query.companyId });
  if (query.agentId) base.push({ agentId: query.agentId });
  if (query.employeeId) base.push(attributedTo(query.employeeId));

  const [core, agentAgg, byEmployee, agents, timing, completedCount] = await Promise.all([
    computeCore(base, from, query.days),
    aggregateByAgent(base),
    computeEmployeeStats(base, from, query.employeeId, query.companyId),
    db.agent.findMany({
      // Scoped like the calls: an unscoped agent list would name another
      // company's agents in the breakdown even with every figure at zero.
      where: {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.agentId ? { id: query.agentId } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    }),
    // Timestamps only — the heatmap needs when each call ran and whether it
    // connected, not the call itself.
    db.call.findMany({ where: { AND: base }, select: { startedAt: true, durationSec: true } }),
    db.call.count({ where: { AND: [...base, { status: CallStatus.completed }] } }),
  ]);

  return {
    days: query.days,
    from: from.toISOString(),
    to: now.toISOString(),
    generatedAt: new Date().toISOString(),
    employeeId: query.employeeId,
    agentId: query.agentId,
    totals: core.totals,
    daily: core.daily,
    byEmployee,
    byAgent: toAgentStats(agents, agentAgg),
    outcomes: core.outcomes,
    bestTime: bestTimeFrom(timing),
    funnel: funnelFrom(core.totals, completedCount),
  };
}

// ---------------------------------------------------------------------------
// One person (employee, or an admin looking at their own record)
// ---------------------------------------------------------------------------

/**
 * The caller's own calling record.
 *
 * `userId` must come from the session. Nothing here widens the scope: every
 * query is filtered by it, so this is safe to expose to any signed-in user.
 */
export async function computeMyAnalytics(
  userId: string,
  query: MyAnalyticsQuery
): Promise<MyAnalyticsPayload> {
  const now = new Date();
  const from = rangeStart(now, query.days);

  const base: Prisma.CallWhereInput[] = [{ startedAt: { gte: from } }, attributedTo(userId)];

  const [core, agentAgg, profile, callbacksBooked, leadRows] = await Promise.all([
    computeCore(base, from, query.days),
    aggregateByAgent(base),
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        employeeId: true,
        role: true,
        lastLoginAt: true,
        _count: { select: { assignedContacts: true } },
      },
    }),
    db.note.count({
      where: { authorId: userId, callbackAt: { not: null }, createdAt: { gte: from } },
    }),
    // Pipeline state is a "right now" figure, so it is deliberately not
    // restricted to the selected range the way the call figures are.
    db.contact.groupBy({ by: ['status'], where: { assignedToId: userId }, _count: true }),
  ]);

  // Only the agents this person actually dialled with — the full company list
  // would be mostly empty rows for them.
  const usedAgentIds = Array.from(agentAgg.tallies.keys());
  const agents = usedAgentIds.length
    ? await db.agent.findMany({
        where: { id: { in: usedAgentIds } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, isActive: true },
      })
    : [];

  // `base` is already scoped to this person, so the range totals *are* their
  // row — no second pass over the attribution rule needed.
  const me: EmployeeStat = {
    id: userId,
    name: profile?.name ?? 'You',
    employeeId: profile?.employeeId ?? null,
    role: profile?.role ?? Role.employee,
    calls: core.totals.calls,
    connected: core.totals.connected,
    interested: core.totals.interested,
    connectRate: core.totals.connectRate,
    interestRate: core.totals.interestRate,
    avgDurationSec: core.totals.avgDurationSec,
    totalTalkTimeSec: core.totals.totalTalkTimeSec,
    leadsAssigned: profile?._count.assignedContacts ?? 0,
    callbacksBooked,
    lastLoginAt: profile?.lastLoginAt ? profile.lastLoginAt.toISOString() : null,
  };

  const leadTotals = {} as Record<ContactStatus, number>;
  for (const status of Object.values(ContactStatus)) leadTotals[status] = 0;
  for (const row of leadRows) leadTotals[row.status] += row._count;

  const leadsByStatus: LeadStatusSlice[] = Object.values(ContactStatus)
    .map((status) => ({ status, count: leadTotals[status] }))
    .sort((a, b) => b.count - a.count);

  return {
    days: query.days,
    from: from.toISOString(),
    to: now.toISOString(),
    generatedAt: new Date().toISOString(),
    userId,
    totals: core.totals,
    daily: core.daily,
    byAgent: toAgentStats(agents, agentAgg),
    outcomes: core.outcomes,
    me,
    leadsByStatus,
    callbacksBooked,
  };
}
