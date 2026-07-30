import Link from 'next/link';
import { ArrowRight, Bot, PhoneCall, BarChart3, ShieldCheck, Users, FileText } from 'lucide-react';
import { FinanceBuddhaLogo, FinanceBuddhaMark } from '@/components/brand/logo';
import { HomeReveal } from '@/components/home/home-reveal';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata = {
  title: 'Finance Buddha — AI Voice Operations Platform',
  description:
    "Finance Buddha's internal platform for AI-powered outbound calling — build agents, run bulk campaigns, and track every lead in one place.",
};

const FEATURES = [
  { icon: Bot, title: 'AI voice agents', body: 'Describe an agent in a sentence; it drafts the persona, prompt and qualification rules for you.' },
  { icon: PhoneCall, title: 'Bulk campaigns', body: 'Upload contacts, set pacing and business hours, and let the engine dial through them automatically.' },
  { icon: FileText, title: 'Transcripts & summaries', body: 'Every call is recorded, transcribed and summarised, with a lead outcome you can act on.' },
  { icon: BarChart3, title: 'Live monitoring', body: 'Watch calls as they happen and see connect rates, outcomes and agent performance in real time.' },
  { icon: Users, title: 'Team & leads', body: 'Assign leads to employees, track their activity, and keep everyone on their own workspace.' },
  { icon: ShieldCheck, title: 'Secure by role', body: 'Admins run the platform; employees see only their leads, calls and recordings. Access by invitation.' },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-brand-50/60 via-white to-white dark:from-[#0a1020] dark:via-[#020617] dark:to-[#020617]">
      {/* Ambient blue wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-32 w-[42rem] h-[42rem] rounded-full blur-[130px] bg-brand-400/20 dark:bg-brand-600/20" />
        <div className="absolute top-24 -right-40 w-[38rem] h-[38rem] rounded-full blur-[130px] bg-sky-400/15 dark:bg-sky-500/15" />
        <div
          className="absolute inset-0 opacity-[0.5] dark:opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(94 128 192 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(94 128 192 / 0.08) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent 78%)',
          }}
        />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-[#020617]/60 border-b border-slate-200/70 dark:border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 h-16">
          <FinanceBuddhaLogo size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-brand-600/20"
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <HomeReveal>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 text-center">
          <div data-reveal className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
              Internal operations platform
            </span>
          </div>

          <h1 data-reveal className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.05]">
            AI voice calling,
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">
              run end to end.
            </span>
          </h1>

          <p data-reveal className="mt-6 max-w-2xl mx-auto text-lg text-slate-600 dark:text-slate-400">
            Finance Buddha&apos;s platform for building AI voice agents, running bulk outbound
            campaigns, and turning every call into a qualified lead — all from one dashboard.
          </p>

          <div data-reveal className="mt-9 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-colors shadow-xl shadow-brand-600/25"
            >
              Open the dashboard <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center h-12 px-6 rounded-xl border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              What it does
            </a>
          </div>

          {/* Hero mark — the exact logo as a clean badge, glow behind */}
          <div data-reveal className="mt-16 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-6 blur-3xl bg-gradient-to-br from-brand-400/40 to-sky-400/40 rounded-full" />
              <FinanceBuddhaMark
                rounded="rounded-3xl"
                className="relative w-40 h-40 ring-1 ring-slate-200/70 dark:ring-white/10 shadow-2xl shadow-brand-900/20"
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-5 py-16">
          <div data-reveal className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Everything the calling team needs
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              Built for Finance Buddha&apos;s operations — from the first agent to the final report.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                data-reveal
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-600/5 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/15 to-sky-500/15 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-6xl mx-auto px-5 py-16">
          <div
            data-reveal
            className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-600 to-sky-500 px-8 py-14 text-center"
          >
            <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white, transparent 40%)' }} />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Ready to start calling?</h2>
              <p className="mt-3 text-white/85 max-w-md mx-auto">
                Sign in with your work email or employee ID. New here? Your administrator sets up your account.
              </p>
              <Link
                href="/login"
                className="mt-7 inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition-colors shadow-xl"
              >
                Sign in <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </HomeReveal>

      <footer className="border-t border-slate-200/70 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <FinanceBuddhaLogo size="sm" />
          <p className="text-xs text-slate-500 dark:text-slate-500">
            © {new Date().getFullYear()} Finance Buddha · Internal operations platform
          </p>
        </div>
      </footer>
    </main>
  );
}
