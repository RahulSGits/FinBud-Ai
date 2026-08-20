import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { Nav } from '@/components/shell/nav';
import { AmbientBackground } from '@/components/ui/ambient-background';

export const dynamic = 'force-dynamic';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Re-checked here, not just in middleware — middleware decides routing, this
  // is the actual boundary.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // The platform owner is not exempt from the first-login password change. An
  // account that can suspend every customer is the last one that should keep a
  // password somebody else chose for it.
  if (user.mustChangePassword) redirect('/change-password');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  return (
    <div className="relative lg:flex min-h-screen bg-slate-50 dark:bg-[#020617]">
      <AmbientBackground />
      <Nav variant="platform" />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
