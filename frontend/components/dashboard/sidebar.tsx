'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BarChart3, Settings, CreditCard, Bell, Brain, BookOpen, MessageSquare, ChevronLeft, LogOut, Zap, Megaphone, Phone, ExternalLink, Users, Plug, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

export const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/agents', label: 'AI Agents', icon: Brain },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/dashboard/calls', label: 'Call Logs', icon: MessageSquare },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/dashboard/contacts', label: 'Contacts', icon: Users },
  { href: '/dashboard/phone-numbers', label: 'Phone Numbers', icon: Phone },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
];

export const SECONDARY = [
  { href: '/dashboard/sarvam-test', label: 'Sarvam Testing', icon: Zap },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, signOut, isAdmin } = useAuth();

  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  const initials = user?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';

  return (
    <aside className={cn('hidden md:flex flex-col h-screen sticky top-0 bg-slate-50 dark:bg-[#050d1a] border-r border-slate-200 dark:border-white/5 transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex items-center h-14 border-b border-slate-200 dark:border-white/5 px-4', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
          <Phone className="w-4 h-4 text-slate-900 dark:text-white" />
        </div>
        {!collapsed && <><span className="text-sm font-bold text-slate-900 dark:text-white">FinBud</span><span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">AI</span></>}
        <button onClick={() => setCollapsed(!collapsed)} className="text-slate-600 hover:text-slate-500 dark:text-slate-400 ml-auto hidden lg:block">
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {isAdmin && (
        <div className="px-3 pt-3">
          <Link href="/admin">
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors', collapsed && 'justify-center px-0')}>
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="text-xs font-bold uppercase tracking-wider">Back to Admin</span>}
            </div>
          </Link>
        </div>
      )}



      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {NAV.map(item => (
          <Link key={item.href} href={item.href}>
            <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors', isActive(item.href) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10', collapsed && 'justify-center px-0')}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </div>
          </Link>
        ))}
        <div className="my-3 border-t border-slate-200 dark:border-white/5" />
        {SECONDARY.map(item => (
          <Link key={item.href} href={item.href}>
            <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors', isActive(item.href) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10', collapsed && 'justify-center px-0')}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </div>
          </Link>
        ))}
        <div className="my-3 border-t border-slate-200 dark:border-white/5" />
        <a href="/docs" target="_blank" rel="noopener noreferrer">
          <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10', collapsed && 'justify-center px-0')}>
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="text-sm">Documentation</span>}
          </div>
        </a>
      </nav>

      <div className="border-t border-slate-200 dark:border-white/5 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{initials}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.fullName || user?.email || 'User'}</div>
            </div>
            <button onClick={signOut} className="opacity-0 group-hover:opacity-100 text-slate-600 dark:text-slate-500 hover:text-red-600 dark:text-red-400 transition-all"><LogOut className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={signOut} className="w-full flex justify-center p-2 text-slate-600 dark:text-slate-500 hover:text-red-600 dark:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"><LogOut className="w-4 h-4" /></button>
        )}
      </div>
    </aside>
  );
}
