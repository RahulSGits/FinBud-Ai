import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import UserList from '@/components/admin/user-list';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const admin = await getAuthUser();
  if (!admin || admin.role !== 'admin') redirect('/dashboard');

  const users = await db.user.findMany({
    include: {
      organization: {
        select: {
          name: true,
          _count: {
            select: { agents: true, callLogs: true, campaigns: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Convert Date objects to strings for the client component
  const serializedUsers = users.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    agentCount: u.organization?._count?.agents || 0,
    callCount: u.organization?._count?.callLogs || 0,
    campaignCount: u.organization?._count?.campaigns || 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <UserList initialUsers={serializedUsers} />
    </div>
  );
}
