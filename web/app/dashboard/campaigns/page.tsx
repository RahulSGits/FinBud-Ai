import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CallStatus, ContactStatus } from '@prisma/client';
import { Bot, CalendarClock, ChevronRight, Clock, Megaphone, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin, visibleAgents, visibleCampaigns, visibleContacts } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { CampaignControls } from '@/components/campaigns/campaign-controls';
import { CampaignForm, DeleteCampaignButton } from '@/components/campaigns/campaign-form';
import { describeWindow, parseBusinessHours } from '@/lib/campaigns/business-hours';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress];
const QUEUED = [ContactStatus.pending, ContactStatus.retry, ContactStatus.calling];

const SECONDARY =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors';

/** Render a scheduled time in the campaign's own timezone, not the server's. */
function formatWhen(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  } catch {
    // A hand-edited timezone string should not take the page down.
    return at.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export default async function MyCampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [campaigns, agents, unassignedCount, leadCount] = await Promise.all([
    db.campaign.findMany({
      where: visibleCampaigns(user),
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true, isActive: true } },
        _count: { select: { contacts: true, calls: true } },
      },
    }),
    // Everything they may dial with: every published agent, plus their own drafts.
    db.agent.findMany({
      where: visibleAgents(user),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    db.contact.count({ where: { ...visibleContacts(user), campaignId: null } }),
    db.contact.count({ where: visibleContacts(user) }),
  ]);

  // Progress in three grouped queries rather than one per campaign, narrowed to
  // the campaigns actually on the page.
  const ids = campaigns.map((c) => c.id);
  const [live, queued, interested] = await Promise.all([
    db.call.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: { in: IN_FLIGHT } }, _count: true }),
    db.contact.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: { in: QUEUED } }, _count: true }),
    db.call.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, interested: true }, _count: true }),
  ]);
  const liveBy = new Map(live.map((r) => [r.campaignId, r._count]));
  const queuedBy = new Map(queued.map((r) => [r.campaignId, r._count]));
  const interestedBy = new Map(interested.map((r) => [r.campaignId, r._count]));

  // The API attaches only the caller's own leads unless they are an admin, so
  // the form's wording has to follow exactly the same rule.
  const audience = isAdmin(user) ? 'all' : 'mine';
  const hasActiveAgent = agents.some((a) => a.isActive);

  const newCampaignButton = (emphasis?: boolean) => (
    <CampaignForm
      agents={agents}
      unassignedCount={unassignedCount}
      audience={audience}
      basePath="/dashboard"
      ownerId={user.id}
      emphasis={emphasis}
    />
  );

  return (
    <>
      <PageHeader
        title="My campaigns"
        subtitle={
          campaigns.length === 0
            ? 'Dial your leads in bulk with one of your agents'
            : `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} you created`
        }
        action={newCampaignButton()}
      />
      <div className="px-6 pb-10 space-y-6">
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Megaphone className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No campaigns yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-5 max-w-md mx-auto">
              A campaign dials through your leads on its own. You need leads assigned to you and an active
              agent to speak for you before it can start.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {newCampaignButton(true)}
              <Link href="/dashboard/leads" className={SECONDARY}>
                <Users className="w-4 h-4" /> My leads
              </Link>
              <Link href="/dashboard/agents" className={SECONDARY}>
                <Bot className="w-4 h-4" /> My agents
              </Link>
            </div>

            {(leadCount === 0 || !hasActiveAgent) && (
              <ul className="mt-5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {leadCount === 0 && (
                  <li>No leads are assigned to you yet — ask your admin, or import a list while creating the campaign.</li>
                )}
                {!hasActiveAgent && <li>No active agent yet — build one and switch it to Active.</li>}
              </ul>
            )}
          </div>
        ) : (
          <ul className="space-y-4">
            {campaigns.map((c) => {
              const total = c._count.contacts;
              const remaining = queuedBy.get(c.id) ?? 0;
              const done = Math.max(0, total - remaining);
              const pct = total ? Math.round((done / total) * 100) : 0;
              const hours = parseBusinessHours(c.businessHours);
              // An admin passing through this screen sees everyone's campaigns,
              // so authorship — not merely being able to see the row — decides
              // whether the editing controls are offered.
              const owns = isAdmin(user) || c.createdById === user.id;

              return (
                <li key={c.id} className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/campaigns/${c.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        {c.name}
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.agent.name} · {total} lead{total === 1 ? '' : 's'} · concurrency {c.concurrency}
                        {c.dailyCallLimit ? ` · ${c.dailyCallLimit}/day` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Calls {describeWindow(hours)}
                        </span>
                        {c.scheduledAt && (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5" />
                            Held until {formatWhen(c.scheduledAt, hours?.tz ?? 'Asia/Kolkata')}
                          </span>
                        )}
                        {!c.agent.isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            Agent is a draft
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      {/* Their own campaign, so they drive it — including the tick loop. */}
                      <CampaignControls
                        campaignId={c.id}
                        status={c.status}
                        liveCalls={liveBy.get(c.id) ?? 0}
                        remaining={remaining}
                        canControl={owns}
                      />
                      {owns && (
                        <>
                          <CampaignForm
                            agents={agents}
                            unassignedCount={unassignedCount}
                            audience={audience}
                            basePath="/dashboard"
                            ownerId={user.id}
                            campaign={{
                              id: c.id,
                              name: c.name,
                              agentId: c.agentId,
                              concurrency: c.concurrency,
                              dailyCallLimit: c.dailyCallLimit,
                              retryLimit: c.retryLimit,
                              retryDelayMins: c.retryDelayMins,
                              businessHours: c.businessHours,
                              scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
                            }}
                          />
                          <DeleteCampaignButton id={c.id} name={c.name} status={c.status} />
                        </>
                      )}
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="tabular-nums">{done}/{total} processed</span>
                    <span className="tabular-nums">{c._count.calls} calls</span>
                    <span className="tabular-nums text-brand-600 dark:text-brand-400">
                      {interestedBy.get(c.id) ?? 0} interested
                    </span>
                    <Link
                      href={`/dashboard/campaigns/${c.id}`}
                      className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      View results <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
