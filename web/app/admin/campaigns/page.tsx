import { CallStatus, ContactStatus } from '@prisma/client';
import { CalendarClock, Clock, Megaphone } from 'lucide-react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canUseAdminArea, visibleAgents, visibleCalls, visibleCampaigns, visibleContacts } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { CampaignControls } from '@/components/campaigns/campaign-controls';
import { CampaignForm, DeleteCampaignButton } from '@/components/campaigns/campaign-form';
import { describeWindow, parseBusinessHours } from '@/lib/campaigns/business-hours';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress];
const QUEUED = [ContactStatus.pending, ContactStatus.retry, ContactStatus.calling];

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

export default async function CampaignsPage() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canUseAdminArea(user)) redirect('/dashboard');

  const [campaigns, agents, unassignedCount] = await Promise.all([
    db.campaign.findMany({
      where: visibleCampaigns(user),
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
        _count: { select: { contacts: true, calls: true } },
      },
    }),
    db.agent.findMany({
      where: visibleAgents(user),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    db.contact.count({ where: { ...visibleContacts(user), campaignId: null } }),
  ]);

  // Two grouped queries rather than per-campaign lookups.
  const [live, queued, interested] = await Promise.all([
    db.call.groupBy({ by: ['campaignId'], where: { ...visibleCalls(user), status: { in: IN_FLIGHT } }, _count: true }),
    db.contact.groupBy({ by: ['campaignId'], where: { ...visibleContacts(user), status: { in: QUEUED } }, _count: true }),
    db.call.groupBy({ by: ['campaignId'], where: { ...visibleCalls(user), interested: true }, _count: true }),
  ]);
  const liveBy = new Map(live.map((r) => [r.campaignId, r._count]));
  const queuedBy = new Map(queued.map((r) => [r.campaignId, r._count]));
  const interestedBy = new Map(interested.map((r) => [r.campaignId, r._count]));

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Bulk outbound calling"
        action={<CampaignForm agents={agents} unassignedCount={unassignedCount} />}
      />
      <div className="px-6 pb-10">
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Megaphone className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No campaigns yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Import contacts, pick an agent, and start dialling.</p>
            <div className="flex justify-center">
              <CampaignForm agents={agents} unassignedCount={unassignedCount} emphasis />
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {campaigns.map((c) => {
              const total = c._count.contacts;
              const remaining = queuedBy.get(c.id) ?? 0;
              const done = Math.max(0, total - remaining);
              const pct = total ? Math.round((done / total) * 100) : 0;
              const hours = parseBusinessHours(c.businessHours);

              return (
                <li key={c.id} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{c.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.agent.name} · {total} contacts · concurrency {c.concurrency}
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
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <CampaignControls
                        campaignId={c.id}
                        status={c.status}
                        liveCalls={liveBy.get(c.id) ?? 0}
                        remaining={remaining}
                      />
                      <CampaignForm
                        agents={agents}
                        unassignedCount={unassignedCount}
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
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="tabular-nums">{done}/{total} processed</span>
                    <span className="tabular-nums">{c._count.calls} calls</span>
                    <span className="tabular-nums text-brand-600 dark:text-brand-400">
                      {interestedBy.get(c.id) ?? 0} interested
                    </span>
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
