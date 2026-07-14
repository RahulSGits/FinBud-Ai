'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CreditCard, Settings, LogOut,
  ShieldAlert, Phone, ScrollText, Server, ChevronLeft, Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/providers', label: 'API Providers', icon: Server },
  { href: '/admin/calls', label: 'Call Monitor', icon: Phone },
  { href: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
];

function NavLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  return (
    <>
      <div className={cn('text-[10px] font-bold text-indigo-600/60 dark:text-indigo-400/60 uppercase tracking-widest mb-3', collapsed ? 'text-center' : 'px-3')}>
        {collapsed ? '—' : 'Platform'}
      </div>
      {NAV.map(item => (
        <Link key={item.href} href={item.href} onClick={onNavigate}>
          <div className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200',
            isActive(item.href)
              ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10',
            collapsed && 'justify-center px-0'
          )}>
            <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive(item.href) ? 'text-indigo-600 dark:text-indigo-400' : '')} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </div>
        </Link>
      ))}
    </>
  );
}

function FooterLinks({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { signOut } = useAuth();
  return (
    <>
      <Link href="/dashboard" onClick={onNavigate}>
        <div className={cn('flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-500 hover:text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5 transition-all mb-1', collapsed && 'justify-center px-0')}>
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>User View</span>}
        </div>
      </Link>
      <button onClick={signOut} className={cn('flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-500 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-all w-full', collapsed && 'justify-center px-0')}>
        <LogOut className="w-4 h-4 flex-shrink-0" />
        {!collapsed && <span>Sign Out</span>}
      </button>
    </>
  );
}

function Brand({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className={cn('flex items-center h-14 border-b border-indigo-500/10 px-4', collapsed ? 'justify-center' : 'gap-3')}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <ShieldAlert className="w-4 h-4 text-slate-900 dark:text-white" />
      </div>
      {!collapsed && <><span className="text-sm font-bold text-slate-900 dark:text-white">FinBud</span><span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">ADMIN</span></>}
      {onToggle && (
        <button onClick={onToggle} className="text-slate-600 hover:text-slate-500 dark:text-slate-400 ml-auto hidden lg:block">
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

export default function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn('hidden md:flex flex-col h-screen sticky top-0 bg-white dark:bg-[#080c1a] border-r border-indigo-500/10 transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <Brand collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        <NavLinks collapsed={collapsed} />
      </nav>
      <div className="border-t border-indigo-500/10 p-3">
        {!collapsed && <div className="flex items-center justify-between px-3 py-2 mb-1"><span className="text-xs text-slate-600 dark:text-slate-500">Theme</span><ThemeToggle /></div>}
        <FooterLinks collapsed={collapsed} />
      </div>
    </aside>
  );
}

// Mobile top bar with a slide-out drawer; rendered by the admin layout on small screens.
export function AdminMobileBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-4 gap-3 bg-white dark:bg-[#080c1a] border-b border-indigo-500/10">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="text-slate-600 dark:text-slate-300 hover:text-white p-1"><Menu className="w-5 h-5" /></button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-white dark:bg-[#080c1a] border-r border-indigo-500/10 flex flex-col h-full">
          <Brand />
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
            <NavLinks onNavigate={() => setOpen(false)} />
          </nav>
          <div className="border-t border-indigo-500/10 p-3">
            <FooterLinks onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <ShieldAlert className="w-4 h-4 text-slate-900 dark:text-white" />
        </div>
        <span className="text-sm font-bold text-slate-900 dark:text-white">FinBud</span>
        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">ADMIN</span>
      </div>
      <div className="ml-auto"><ThemeToggle /></div>
    </header>
  );
}
