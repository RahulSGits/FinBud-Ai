'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import {
  ArrowRight, Bot, PhoneCall, PlayCircle, Mic, Globe, Zap, Settings,
  CheckCircle2, BarChart3, Users, Shield, Clock, Star, ChevronRight,
  Building2, HeartHandshake, Stethoscope, Dumbbell, Home as HomeIcon, Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';

const INDUSTRIES = [
  { name: 'Finance & Wealth', color: 'text-blue-400', icon: Briefcase },
  { name: 'Healthcare & Clinics', color: 'text-emerald-400', icon: Stethoscope },
  { name: 'Gym & Fitness', color: 'text-amber-400', icon: Dumbbell },
  { name: 'Real Estate', color: 'text-purple-400', icon: HomeIcon },
  { name: 'SaaS & Tech', color: 'text-indigo-400', icon: Building2 },
];

const STATS = [
  { value: '2.1M+', label: 'Calls Completed' },
  { value: '98.7%', label: 'Uptime SLA' },
  { value: '40+', label: 'Languages' },
  { value: '<0.3s', label: 'Avg Latency' },
];

const FEATURES = [
  {
    icon: Mic,
    title: 'Human-like Voice',
    desc: 'Cloned voices with emotional inflection via Sarvam and Exote TTS engines.',
    color: 'from-emerald-500/20 to-teal-500/10',
    border: 'border-emerald-500/20',
  },
  {
    icon: Zap,
    title: 'Sub-Second Latency',
    desc: 'Optimized WebRTC endpoints deliver natural, zero-lag conversations at scale.',
    color: 'from-amber-500/20 to-orange-500/10',
    border: 'border-amber-500/20',
  },
  {
    icon: Globe,
    title: '40+ Languages',
    desc: 'Support for English, Hindi, Spanish, Tamil, Marathi and 35+ more regional languages.',
    color: 'from-blue-500/20 to-indigo-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    desc: 'Live dashboards with call transcripts, conversion tracking, and ROI metrics.',
    color: 'from-purple-500/20 to-violet-500/10',
    border: 'border-purple-500/20',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'SOC 2 compliant with end-to-end encryption and role-based access controls.',
    color: 'from-red-500/20 to-rose-500/10',
    border: 'border-red-500/20',
  },
  {
    icon: HeartHandshake,
    title: 'CRM Integrations',
    desc: 'Native integrations with Salesforce, HubSpot, Zoho, and 50+ business tools.',
    color: 'from-cyan-500/20 to-sky-500/10',
    border: 'border-cyan-500/20',
  },
];

const TESTIMONIALS = [
  {
    name: 'Arjun Mehta',
    role: 'Head of Sales, FinEdge Wealth',
    avatar: 'AM',
    color: 'from-blue-600 to-indigo-600',
    text: 'FinBud AI completely transformed our lead qualification. We went from 30% pickup rates to 78% — and our agents now focus only on warm leads.',
    rating: 5,
  },
  {
    name: 'Priya Sharma',
    role: 'Operations Director, HealthFirst Clinics',
    avatar: 'PS',
    color: 'from-emerald-600 to-teal-600',
    text: 'Appointment reminders used to take our staff 4 hours a day. FinBud handles 500 calls a night without a single complaint. Game changer.',
    rating: 5,
  },
  {
    name: 'Rahul Nair',
    role: 'CEO, FitZone Gyms',
    avatar: 'RN',
    color: 'from-amber-600 to-orange-600',
    text: 'We run bulk outreach campaigns for membership renewals and new trials. ROI was positive within the first week. Incredible product.',
    rating: 5,
  },
];



const HOW_IT_WORKS = [
  { step: '01', title: 'Create Your Agent', desc: 'Define persona, voice, language, and system prompt in minutes using industry templates.' },
  { step: '02', title: 'Upload Knowledge', desc: 'Add FAQs, scripts, product docs — the agent learns and answers naturally.' },
  { step: '03', title: 'Launch Campaigns', desc: 'Upload contact lists and launch bulk outbound campaigns with a single click.' },
  { step: '04', title: 'Track & Optimize', desc: 'Monitor live calls, review transcripts, and optimize based on real conversion data.' },
];

export default function Home() {
  const [industryIdx, setIndustryIdx] = useState(0);

  // Interactive 3D tilt for the hero mockup (follows the cursor).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [14, -14]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [-12, 12]), { stiffness: 120, damping: 18 });
  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const resetTilt = () => { mx.set(0); my.set(0); };

  useEffect(() => {
    const timer = setInterval(() => {
      setIndustryIdx((prev) => (prev + 1) % INDUSTRIES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-50 selection:bg-emerald-500/30 font-sans overflow-hidden flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-[30%] right-[-15%] w-[40%] h-[60%] bg-indigo-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[40%] bg-cyan-600/8 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
        {/* Animated 3D perspective grid floor */}
        <div className="absolute bottom-0 left-0 right-0 h-[55vh] overflow-hidden [perspective:340px] opacity-40">
          <div className="finbud-grid-floor absolute inset-x-[-50%] bottom-0 h-[200%] [transform:rotateX(70deg)] origin-bottom bg-[linear-gradient(rgba(16,185,129,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.25)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>
      </div>

      <Navbar />

      <main className="relative z-10 pt-20 flex-1">
        {/* ── Hero ── */}
        <section className="pt-28 pb-16 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Vocal AI for Indian & Global Businesses
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-5xl leading-[1.08]"
          >
            Build human-like AI<br className="hidden md:block" /> voice agents for{' '}
            <span className="inline-block h-[1.15em] overflow-hidden align-bottom relative">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={industryIdx}
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '-100%', opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.55 }}
                  className={cn('block', INDUSTRIES[industryIdx].color)}
                >
                  {INDUSTRIES[industryIdx].name}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mb-10 leading-relaxed"
          >
            Deploy conversational AI that makes inbound and outbound calls, speaks fluent regional languages, schedules appointments, and qualifies leads 24/7 — without hiring a single agent.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-12"
          >
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full text-base font-semibold shadow-[0_0_40px_rgba(16,185,129,0.35)] hover:shadow-[0_0_60px_rgba(16,185,129,0.55)] transition-all gap-2">
                Start Free Trial <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 rounded-full text-base border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white transition-colors gap-2">
                <PlayCircle className="w-5 h-5 text-emerald-400" /> View Live Demo
              </Button>
            </Link>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-6 text-xs text-slate-600 dark:text-slate-500"
          >
            {['No credit card required', 'Free 14-day trial', 'Cancel anytime', 'SOC 2 compliant'].map(t => (
              <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{t}</span>
            ))}
          </motion.div>
        </section>

        {/* ── Dashboard Preview (interactive 3D — kept dark as a product screenshot) ── */}
        <section className="dark px-6 pb-24 max-w-6xl mx-auto" style={{ perspective: '1600px' }}>
          <motion.div
            onMouseMove={onTilt}
            onMouseLeave={resetTilt}
            initial={{ opacity: 0, rotateX: 18, y: 60, scale: 0.92 }}
            animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.4, type: 'spring', damping: 20 }}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
            className="relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128]/90 backdrop-blur-xl shadow-[0_40px_80px_-20px_rgba(16,185,129,0.25)] overflow-visible will-change-transform"
          >
            {/* Floating depth cards */}
            <motion.div style={{ transform: 'translateZ(80px)' }} className="hidden md:flex absolute -top-6 -left-6 z-20 items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/90 text-white text-xs font-semibold shadow-xl shadow-emerald-500/40 backdrop-blur">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Call connected
            </motion.div>
            <motion.div style={{ transform: 'translateZ(120px)' }} className="hidden md:flex absolute -bottom-5 -right-5 z-20 items-center gap-2 px-3 py-2 rounded-xl bg-white text-[#0a1128] text-xs font-bold shadow-xl backdrop-blur">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" /> +1 qualified lead
            </motion.div>
            <div className="rounded-2xl overflow-hidden" style={{ transform: 'translateZ(0)' }}>
            {/* Window chrome */}
            <div className="h-11 border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-amber-500/70" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
              <div className="mx-auto flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-4 py-1 rounded-full border border-slate-200 dark:border-white/10">
                <PhoneCall className="w-3 h-3 text-emerald-400" />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-mono">finbud.ai/dashboard — Live Call Tracking</span>
              </div>
            </div>

            <div className="p-6 md:p-10 grid md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <Bot className="w-8 h-8 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Sales Bot Priya</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <p className="text-emerald-400 text-sm font-medium">Active & Calling</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-1">
                    <span>Lead Qualification</span><span className="text-emerald-400 font-semibold">78% Success</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: '0%' }} animate={{ width: '78%' }} transition={{ duration: 1.5, delay: 1 }} className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Total Calls', value: '842', sub: '+12% this week' },
                    { label: 'Talk Time', value: '24.5h', sub: 'this month' },
                    { label: 'Conversions', value: '212', sub: '25.2% rate' },
                    { label: 'Avg Duration', value: '3:24', sub: 'per call' },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/5 rounded-xl p-4 hover:border-emerald-500/20 transition-colors">
                      <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">{s.label}</div>
                      <div className="text-xs text-emerald-400/70 mt-1">{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a1128] to-transparent z-10" />
                <div className="space-y-5">
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }} className="flex gap-3 items-end">
                    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl rounded-bl-none p-4 text-sm text-slate-600 dark:text-slate-300 max-w-[85%]">
                      &quot;Hello, this is Priya from FinEdge Wealth. Are you still interested in the investment plans you viewed last week?&quot;
                    </div>
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30"><Bot className="w-3.5 h-3.5 text-emerald-400" /></div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.8 }} className="flex gap-3 items-end flex-row-reverse">
                    <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-none p-4 text-sm text-white max-w-[80%]">
                      &quot;Yes, actually. Can we set up a time to talk tomorrow?&quot;
                    </div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.8 }} className="flex gap-3 items-end">
                    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl rounded-bl-none p-4 text-sm text-slate-600 dark:text-slate-300 max-w-[85%]">
                      &quot;Absolutely! I have 10 AM or 2 PM tomorrow. Which works better? I can send a calendar invite instantly.&quot;
                    </div>
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30"><Bot className="w-3.5 h-3.5 text-emerald-400" /></div>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 3.8 }} className="flex gap-3 items-end flex-row-reverse">
                    <div className="bg-emerald-600/20 border border-emerald-500/30 rounded-2xl rounded-br-none p-4 text-sm text-emerald-200 max-w-[80%]">
                      &quot;10 AM works perfectly. See you then!&quot;
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
            </div>
          </motion.div>
        </section>

        {/* ── Stats Bar ── */}
        <section className="py-12 border-y border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {STATS.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-1">{s.value}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-500">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Grid ── */}
        <section className="py-28 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-4">
              Platform Capabilities
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Everything you need to<br className="hidden md:block" /> automate voice at scale
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 }} className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto text-lg">
              One platform to build, deploy, monitor, and optimize AI voice agents — no engineering team required.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className={cn('relative bg-gradient-to-br border rounded-2xl p-8 group overflow-hidden cursor-pointer transition-shadow hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]', f.color, f.border)}
              >
                <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center mb-6 border transition-transform group-hover:scale-110', f.border, 'bg-slate-100 dark:bg-white/5')}>
                  <f.icon className="w-7 h-7 text-slate-900 dark:text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
                <ChevronRight className="absolute bottom-8 right-8 w-5 h-5 text-slate-900 dark:text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-24 px-6 bg-slate-50 dark:bg-white/[0.02] border-y border-slate-200 dark:border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
                Up and running in minutes
              </motion.h2>
              <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
                Four simple steps to launch your first AI voice campaign.
              </motion.p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
              {/* connector line */}
              <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
              {HOW_IT_WORKS.map((step, i) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="relative bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl p-6 hover:border-emerald-500/20 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm mb-4 group-hover:bg-emerald-500/25 transition-colors">
                    {step.step}
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="py-28 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Trusted by growth teams
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
              Businesses across India and beyond use FinBud AI to close more deals, faster.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl p-8 hover:border-white/10 transition-colors"
              >
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-6 text-sm">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold flex-shrink-0', t.color)}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-slate-900 dark:text-white font-semibold text-sm">{t.name}</div>
                    <div className="text-slate-600 dark:text-slate-500 text-xs">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-28 px-6 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-3xl p-12 md:p-16 overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.1),transparent_70%)]" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <PhoneCall className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4">
                Ready to automate your calls?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto mb-10">
                Join thousands of businesses using FinBud AI to scale their outreach — 24/7, in any language, at a fraction of the cost.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register">
                  <Button size="lg" className="h-14 px-10 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full text-base font-semibold shadow-[0_0_40px_rgba(16,185,129,0.35)] gap-2">
                    Start Building Free <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white gap-2">
                    <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" /> Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
