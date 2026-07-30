import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { CallList } from '@/components/calls/call-list';
import { ManualDial } from '@/components/calls/manual-dial';
import { toCallRow } from '@/lib/calls/serialize';

export const dynamic = 'force-dynamic';

export default async function AdminCallsPage() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const calls = await db.call.findMany({
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
        title="Call logs"
        subtitle={`${calls.length} recent call${calls.length === 1 ? '' : 's'} across the company`}
        action={<ManualDial basePath="/admin" />}
      />
      <div className="px-6 pb-10">
        <CallList calls={calls.map(toCallRow)} />
      </div>
    </>
  );
}
