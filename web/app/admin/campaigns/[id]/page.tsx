import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canUseAdminArea } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import {
  CampaignDetail,
  type CampaignContactRow,
  type CampaignSummary,
} from '@/components/campaigns/campaign-detail';

export const dynamic = 'force-dynamic';

export default async function AdminCampaignPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // middleware.ts already keeps employees out of /admin, but routing is not the
  // security boundary — the page re-checks for itself.
  if (!canUseAdminArea(user)) redirect('/dashboard');

  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      agent: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!campaign) notFound();

  const [contacts, agents, unassignedCount] = await Promise.all([
    db.contact.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
      include: {
        assignedTo: { select: { name: true } },
        // Only this campaign's calls: a manual dial placed outside it belongs to
        // the lead's own history, not to these results.
        calls: {
          where: { campaignId: campaign.id },
          orderBy: { startedAt: 'desc' },
          include: { agent: { select: { name: true } } },
        },
      },
    }),
    db.agent.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    db.contact.count({ where: { campaignId: null } }),
  ]);

  const summary: CampaignSummary = {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    agentId: campaign.agentId,
    agentName: campaign.agent.name,
    agentIsActive: campaign.agent.isActive,
    createdByName: campaign.createdBy?.name ?? null,
    concurrency: campaign.concurrency,
    dailyCallLimit: campaign.dailyCallLimit,
    retryLimit: campaign.retryLimit,
    retryDelayMins: campaign.retryDelayMins,
    businessHours: campaign.businessHours,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    startedAt: campaign.startedAt?.toISOString() ?? null,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
  };

  const contactRows: CampaignContactRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    loanType: c.loanType,
    loanAmount: c.loanAmount,
    status: c.status,
    attempts: c.attempts,
    lastAttemptAt: c.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: c.nextAttemptAt?.toISOString() ?? null,
    assignedToName: c.assignedTo?.name ?? null,
    createdAt: c.createdAt.toISOString(),
    calls: c.calls.map((call) => ({
      id: call.id,
      status: call.status,
      leadStatus: call.leadStatus,
      interested: call.interested,
      durationSec: call.durationSec,
      summary: call.summary,
      transcriptText: call.transcriptText,
      failureReason: call.failureReason,
      customerIntent: call.customerIntent,
      nextAction: call.nextAction,
      objections: call.objections,
      leadScore: call.leadScore,
      agentName: call.agent?.name ?? null,
      startedAt: call.startedAt.toISOString(),
      endedAt: call.endedAt?.toISOString() ?? null,
    })),
  }));

  const subtitle = [
    campaign.agent.name,
    `${contactRows.length} contact${contactRows.length === 1 ? '' : 's'}`,
    campaign.createdBy?.name ? `created by ${campaign.createdBy.name}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={subtitle}
        action={
          <Link
            href="/admin/campaigns"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> All campaigns
          </Link>
        }
      />
      <div className="px-6 pb-10 space-y-6">
        <CampaignDetail
          campaign={summary}
          contacts={contactRows}
          agents={agents}
          unassignedCount={unassignedCount}
          canControl
          canEdit
          audience="all"
          basePath="/admin"
        />
      </div>
    </>
  );
}
