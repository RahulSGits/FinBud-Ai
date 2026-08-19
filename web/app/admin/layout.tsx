import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUseAdminArea } from '@/lib/authz';
import { Nav } from '@/components/shell/nav';
import { AmbientBackground } from '@/components/ui/ambient-background';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Re-checked here, not just in middleware — middleware is routing, this is
  // the actual boundary.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Force the first-login password change before any dashboard access.
  if (user.mustChangePassword) redirect('/change-password');
  if (!canUseAdminArea(user)) redirect('/dashboard');

  return (
    <div className="relative lg:flex min-h-screen bg-slate-50 dark:bg-[#020617]">
      <AmbientBackground />
      <Nav variant="admin" />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
