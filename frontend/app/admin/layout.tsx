'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { AdminMobileBar } from '@/components/admin/sidebar';
import { useAuth } from '@/lib/auth-context';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, isAdmin, router]);

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div></div>;
  if (!user || !isAdmin) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 dark:bg-[#020617] overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminMobileBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
