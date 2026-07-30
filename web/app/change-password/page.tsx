import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/auth/change-password-form';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#020617]">
      <ChangePasswordForm
        forced={!!user.mustChangePassword}
        userName={user.name}
        role={user.role}
      />
    </main>
  );
}
