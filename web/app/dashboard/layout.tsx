import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Nav } from '@/components/shell/nav';
import { AmbientBackground } from '@/components/ui/ambient-background';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Force the first-login password change before any dashboard access.
  if (user.mustChangePassword) redirect('/change-password');

  return (
    <div className="relative lg:flex min-h-screen bg-slate-50 dark:bg-[#020617]">
      <AmbientBackground />
      <Nav variant="employee" />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
