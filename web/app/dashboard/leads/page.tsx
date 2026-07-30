import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { LeadWorkspace, type LeadRow } from '@/components/leads/lead-workspace';

export const dynamic = 'force-dynamic';

export default async function MyLeadsPage({
  searchParams,
}: {
  searchParams?: { lead?: string | string[] };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const contacts = await db.contact.findMany({
    where: { assignedToId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      _count: { select: { calls: true } },
      calls: {
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true, status: true, leadStatus: true, durationSec: true,
          summary: true, transcriptText: true, startedAt: true,
        },
      },
    },
  });

  const leads: LeadRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    loanType: c.loanType,
    loanAmount: c.loanAmount,
    status: c.status,
    callCount: c._count.calls,
    calls: c.calls.map((call) => ({
      id: call.id,
      status: call.status,
      leadStatus: call.leadStatus,
      durationSec: call.durationSec,
      summary: call.summary,
      transcriptText: call.transcriptText,
      startedAt: call.startedAt.toISOString(),
    })),
  }));

  // Deep link from the dashboard's callback list opens that lead straight away.
  const requested = Array.isArray(searchParams?.lead) ? searchParams?.lead[0] : searchParams?.lead;

  return (
    <>
      <PageHeader title="My leads" subtitle={`${leads.length} lead${leads.length === 1 ? '' : 's'} assigned to you`} />
      <div className="px-6 pb-10">
        {leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Users className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No leads assigned yet</p>
            <p className="text-xs text-slate-500 mt-1">Your administrator assigns leads to you. They&apos;ll appear here.</p>
          </div>
        ) : (
          <LeadWorkspace leads={leads} currentUserId={user.id} initialLeadId={requested ?? null} />
        )}
      </div>
    </>
  );
}
