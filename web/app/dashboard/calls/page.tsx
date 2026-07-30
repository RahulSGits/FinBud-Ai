import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { CallList } from '@/components/calls/call-list';
import { ManualDial } from '@/components/calls/manual-dial';
import { toCallRow } from '@/lib/calls/serialize';

export const dynamic = 'force-dynamic';

export default async function EmployeeCallsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Scoped to the leads assigned to this employee.
  const calls = await db.call.findMany({
    where: { contact: { assignedToId: user.id } },
    orderBy: { startedAt: 'desc' },
    take: 300,
    include: {
      contact: { select: { name: true } },
      agent: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="My calls"
        subtitle="Calls on the leads assigned to you"
        action={<ManualDial basePath="/dashboard" />}
      />
      <div className="px-6 pb-10">
        <CallList calls={calls.map(toCallRow)} showAgent={false} />
      </div>
    </>
  );
}
