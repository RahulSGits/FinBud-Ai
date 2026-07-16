'use client';

import Link from 'next/link';
import { PhoneCall, Phone, Menu, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/lib/auth-context';

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="fixed top-0 w-full z-50 flex items-center justify-between px-6 lg:px-12 h-20 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#020617]/80 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Phone className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">FinBud<span className="text-emerald-600 dark:text-emerald-400">AI</span></span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
        <Link href="/" className={cn("transition-colors", pathname === '/' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400")}>Home</Link>
        <Link href="/why" className={cn("transition-colors", pathname === '/why' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400")}>Why FinBud</Link>
        <Link href="/how-it-works" className={cn("transition-colors", pathname === '/how-it-works' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400")}>How it Works</Link>
        <Link href="/faq" className={cn("transition-colors", pathname === '/faq' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400")}>FAQ</Link>
        <a href="/docs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-slate-600 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"><BookOpen className="w-3.5 h-3.5" />Docs</a>
      </nav>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        {user ? (
          <Link href="/dashboard" className="hidden sm:block">
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-500/20 rounded-full px-6">
              Go to Dashboard
            </Button>
          </Link>
        ) : (
          <>
            <Link href="/login">
              <Button variant="ghost" className="text-slate-600 dark:text-white hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 hidden sm:inline-flex">Log in</Button>
            </Link>
            <Link href="/register" className="hidden sm:block">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-500/20 rounded-full px-6">
                Start Free Trial
              </Button>
            </Link>
          </>
        )}

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white p-2"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="absolute top-20 left-0 w-full bg-slate-50 dark:bg-[#020617] border-b border-slate-200 dark:border-white/5 md:hidden flex flex-col px-6 py-4 gap-4 shadow-2xl">
          <nav className="flex flex-col gap-4 text-sm font-medium">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className={cn("transition-colors", pathname === '/' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white")}>Home</Link>
            <Link href="/why" onClick={() => setIsMobileMenuOpen(false)} className={cn("transition-colors", pathname === '/why' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white")}>Why FinBud</Link>
            <Link href="/how-it-works" onClick={() => setIsMobileMenuOpen(false)} className={cn("transition-colors", pathname === '/how-it-works' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white")}>How it Works</Link>
            <Link href="/faq" onClick={() => setIsMobileMenuOpen(false)} className={cn("transition-colors", pathname === '/faq' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-white")}>FAQ</Link>
            <a href="/docs" target="_blank" rel="noopener noreferrer" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-1.5 text-slate-600 dark:text-white"><BookOpen className="w-3.5 h-3.5" />Docs</a>
          </nav>
          <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-white/10">
            {user ? (
              <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-full">Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full border-slate-300 dark:border-white/10 text-slate-700 dark:text-white">Log in</Button>
                </Link>
                <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-full">Start Free Trial</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
