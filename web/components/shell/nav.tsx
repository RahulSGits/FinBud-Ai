'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, BarChart3, Bot, Users, Megaphone, PhoneCall, FileText,
  UserCog, Settings, LogOut, Menu, X, TrendingUp, MessageSquare, Building2,
  ScrollText, Activity, ArrowLeft, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { FinanceBuddhaLogo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** A heading-less first group keeps the landing route at the top, unlabelled. */
interface NavGroup {
  heading?: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Calling',
    items: [
      { href: '/admin/agents', label: 'AI Agents', icon: Bot },
      { href: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/admin/contacts', label: 'Contacts', icon: Users },
      { href: '/admin/calls', label: 'Call Logs', icon: PhoneCall },
      { href: '/admin/messages', label: 'WhatsApp', icon: MessageSquare },
    ],
  },
  {
    heading: 'Company',
    items: [
      { href: '/admin/knowledge', label: 'Knowledge', icon: FileText },
      { href: '/admin/team', label: 'Team', icon: UserCog },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/**
 * The platform owner's area. Deliberately short: this is a landlord's view of
 * the building, not a second copy of the company application.
 */
const PLATFORM_NAV: NavGroup[] = [
  {
    items: [
      { href: '/platform', label: 'Overview', icon: LayoutDashboard },
      { href: '/platform/companies', label: 'Companies', icon: Building2 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/platform/audit', label: 'Audit log', icon: ScrollText },
      { href: '/platform/health', label: 'System health', icon: Activity },
    ],
  },
];

const EMPLOYEE_NAV: NavGroup[] = [
  {
    items: [{ href: '/dashboard', label: 'My Day', icon: LayoutDashboard }],
  },
  {
    heading: 'Calling',
    items: [
      { href: '/dashboard/agents', label: 'My Agents', icon: Bot },
      { href: '/dashboard/campaigns', label: 'My Campaigns', icon: Megaphone },
      { href: '/dashboard/leads', label: 'My Leads', icon: Users },
      { href: '/dashboard/calls', label: 'My Calls', icon: PhoneCall },
      { href: '/dashboard/messages', label: 'WhatsApp', icon: MessageSquare },
      { href: '/dashboard/analytics', label: 'My Performance', icon: TrendingUp },
    ],
  },
  {
    heading: 'Company',
    items: [{ href: '/dashboard/knowledge', label: 'Knowledge', icon: FileText }],
  },
];

// The two landing routes are prefixes of every other route in their section, so
// they only ever match exactly — otherwise /dashboard would light up while
// you're on /dashboard/agents.
const INDEX_ROUTES = ['/admin', '/dashboard', '/platform'];

function isActive(pathname: string, href: string): boolean {
  if (INDEX_ROUTES.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_BY_VARIANT: Record<'admin' | 'employee' | 'platform', NavGroup[]> = {
  admin: ADMIN_NAV,
  employee: EMPLOYEE_NAV,
  platform: PLATFORM_NAV,
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Platform owner',
  admin: 'Administrator',
  manager: 'Manager',
  employee: 'Employee',
  viewer: 'Viewer',
};

export function Nav({ variant }: { variant: 'admin' | 'employee' | 'platform' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const groups = NAV_BY_VARIANT[variant];

  // The platform owner can walk into a company's own area to support it. This
  // is their way back out: without it the only route home is the URL bar,
  // because every link inside a company points further into that company.
  const showReturnToPlatform = user?.role === 'super_admin' && variant !== 'platform';

  return (
    <>
      {/* Mobile bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-white/90 dark:bg-[#020617]/90 backdrop-blur border-b border-slate-200 dark:border-white/10">
        <FinanceBuddhaLogo size="sm" />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="p-2 -mr-2 text-slate-600 dark:text-slate-300"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <aside
        className={cn(
          'lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0 lg:border-r',
          'fixed inset-x-0 top-14 bottom-0 z-30 w-full border-slate-200 dark:border-white/10',
          'bg-white dark:bg-[#020617] p-3 flex flex-col transition-transform lg:transition-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="hidden lg:block px-2 py-3 mb-2">
          <FinanceBuddhaLogo size="sm" />
        </div>

        {/* Grouping made the sidebar tall enough to overflow a short laptop. */}
        <nav className="flex-1 min-h-0 overflow-y-auto">
          {groups.map((group, i) => (
            <div key={group.heading ?? `group-${i}`} className={cn('space-y-1', i > 0 && 'mt-4')}>
              {group.heading && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.heading}
                </p>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="pt-3 border-t border-slate-200 dark:border-white/10">
          {showReturnToPlatform && (
            <Link
              href="/platform"
              onClick={() => setOpen(false)}
              className="mb-2 flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-brand-700 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" /> Back to platform
            </Link>
          )}
          <div className="flex items-center justify-between px-3 py-2 gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {ROLE_LABEL[user?.role ?? ''] ?? 'Employee'}
              </p>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={async () => { await signOut(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
