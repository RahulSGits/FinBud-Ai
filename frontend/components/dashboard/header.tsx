'use client';

import { usePathname } from 'next/navigation';
import { Search, Menu, Phone, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { NAV, SECONDARY } from './sidebar';

import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';

interface HeaderProps { title: string; subtitle?: string; action?: { label: string; onClick: () => void }; }

export default function Header({ title, subtitle, action }: HeaderProps) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <header className="h-14 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#020617]/50 backdrop-blur flex items-center px-4 md:px-6 gap-4 sticky top-0 z-30">
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-slate-50 dark:bg-[#050d1a] border-r border-slate-200 dark:border-white/5 flex flex-col h-full">
            <div className="flex items-center h-14 border-b border-slate-200 dark:border-white/5 px-4 gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-slate-900 dark:text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">FinBud</span><span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">AI</span>
            </div>
            
            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
              {NAV.map(item => (
                <Link key={item.href} href={item.href}>
                  <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors', isActive(item.href) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10')}>
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                </Link>
              ))}
              <div className="my-3 border-t border-slate-200 dark:border-white/5" />
              {SECONDARY.map(item => (
                <Link key={item.href} href={item.href}>
                  <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors', isActive(item.href) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5')}>
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                </Link>
              ))}
            </nav>

            <div className="border-t border-slate-200 dark:border-white/5 p-3">
              <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {getInitials(user?.fullName || 'U')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.fullName || 'User'}</div>
                </div>
                <button onClick={signOut} className="text-slate-600 dark:text-slate-500 hover:text-red-600 dark:text-red-400 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-600 dark:text-slate-500 hidden sm:block">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-500" /><Input placeholder="Search..." className="w-48 h-8 bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-300 dark:border-white/10 text-sm pl-9" /></div>
        <ThemeToggle />
        {action && <Button size="sm" onClick={action.onClick} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 h-8 text-xs gap-1">+ {action.label}</Button>}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer">{getInitials(user?.fullName || 'U')}</div>
      </div>
    </header>
  );
}
