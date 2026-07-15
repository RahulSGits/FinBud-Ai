'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Phone, Search, ChevronRight, BookOpen, Zap, Brain, Mic, PhoneCall, Megaphone, CreditCard, Settings, Shield, Code2, ArrowUpRight, Copy, Check, ExternalLink, Menu, X, ChevronDown, Sparkles, Play, Terminal, FileText, Globe, Upload, MessageSquare, Lock, Layers, Rocket, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

/* ─── Data ─── */
const NAV_SECTIONS = [
  { id: 'getting-started', label: 'Getting Started', icon: Zap, children: [
    { id: 'introduction', label: 'Introduction' },
    { id: 'quickstart', label: 'Quick Start Guide' },
  ]},
  { id: 'agents', label: 'AI Agents', icon: Brain, children: [
    { id: 'create-agent', label: 'Creating an Agent' },
    { id: 'agent-prompts', label: 'System Prompts' },
    { id: 'agent-templates', label: 'Industry Templates' },
    { id: 'agent-voices', label: 'Voice & Language' },
  ]},
  { id: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen, children: [
    { id: 'kb-overview', label: 'Overview' },
    { id: 'kb-upload', label: 'Uploading Documents' },
    { id: 'kb-faq', label: 'FAQ Entries' },
    { id: 'kb-urls', label: 'Website Scraping' },
  ]},
  { id: 'telephony', label: 'Telephony', icon: PhoneCall, children: [
    { id: 'phone-numbers', label: 'Phone Numbers' },
    { id: 'sip-trunking', label: 'SIP Trunking' },
    { id: 'providers', label: 'Supported Providers' },
  ]},
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, children: [
    { id: 'campaign-overview', label: 'Overview' },
    { id: 'bulk-calls', label: 'Bulk Outbound Calls' },
    { id: 'campaign-analytics', label: 'Campaign Analytics' },
  ]},
  { id: 'api-reference', label: 'API Reference', icon: Code2, children: [
    { id: 'api-auth', label: 'Authentication' },
    { id: 'api-agents', label: 'Agents API' },
    { id: 'api-calls', label: 'Calls API' },
    { id: 'api-webhooks', label: 'Webhooks' },
  ]},
  { id: 'billing', label: 'Billing & Plans', icon: CreditCard, children: [
    { id: 'plans', label: 'Subscription Plans' },
    { id: 'credits', label: 'Credits System' },
    { id: 'invoices', label: 'Invoices' },
  ]},
  { id: 'security', label: 'Security', icon: Shield, children: [
    { id: 'data-privacy', label: 'Data Privacy' },
    { id: 'rls', label: 'Row Level Security' },
    { id: 'compliance', label: 'Compliance' },
  ]},
];

/* ─── Animated Counter ─── */
function AnimatedCounter({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const duration = 1500;
          const step = (timestamp: number) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ─── Interactive Code Block with tabs ─── */
function CodeBlock({ tabs, singleCode, language = 'bash' }: { tabs?: { label: string; code: string; lang?: string }[]; singleCode?: string; language?: string }) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const code = tabs ? tabs[activeTab].code : singleCode || '';
  const lang = tabs ? (tabs[activeTab].lang || language) : language;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={ref} className={cn(
      'relative group rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 my-5 transition-all duration-500',
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    )}>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#0a1128] border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1.5">
          {tabs ? tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={cn(
                'px-3 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all',
                i === activeTab
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {tab.label}
            </button>
          )) : (
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">{lang}</span>
            </div>
          )}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 dark:text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all text-[11px]">
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="p-4 bg-white dark:bg-[#060e1f] overflow-x-auto text-sm leading-relaxed">
        <code className="text-slate-800 dark:text-slate-300 font-mono text-xs">{code}</code>
      </pre>
    </div>
  );
}

/* ─── Section Heading ─── */
function SectionHeading({ id, children, icon: Icon }: { id: string; children: React.ReactNode; icon?: any }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <h2 ref={ref} id={id} className={cn(
      'text-2xl font-bold text-slate-900 dark:text-white mt-16 mb-4 scroll-mt-24 flex items-center gap-3 group transition-all duration-500',
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'
    )}>
      {Icon && <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center"><Icon className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" /></div>}
      <span>{children}</span>
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all text-lg">#</a>
    </h2>
  );
}

function SubHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-10 mb-3 scroll-mt-24 flex items-center gap-2 group">
      <span>{children}</span>
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-opacity text-sm">#</a>
    </h3>
  );
}

/* ─── Callout ─── */
function Callout({ type = 'info', children }: { type?: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 dark:bg-blue-500/5 border-l-4 border-l-blue-500 border-y border-r border-y-blue-200 dark:border-y-blue-500/20 border-r-blue-200 dark:border-r-blue-500/20 text-blue-900 dark:text-blue-200',
    warning: 'bg-amber-50 dark:bg-amber-500/5 border-l-4 border-l-amber-500 border-y border-r border-y-amber-200 dark:border-y-amber-500/20 border-r-amber-200 dark:border-r-amber-500/20 text-amber-900 dark:text-amber-200',
    tip: 'bg-emerald-50 dark:bg-emerald-500/5 border-l-4 border-l-emerald-500 border-y border-r border-y-emerald-200 dark:border-y-emerald-500/20 border-r-emerald-200 dark:border-r-emerald-500/20 text-emerald-900 dark:text-emerald-200',
  };
  const icons = { info: '📘', warning: '⚠️', tip: '💡' };
  const labels = { info: 'Note', warning: 'Warning', tip: 'Pro Tip' };
  return (
    <div className={cn('rounded-xl p-4 my-5 text-sm', styles[type])}>
      <div className="font-bold text-xs uppercase tracking-wider mb-1.5 opacity-80 flex items-center gap-1.5">{icons[type]} {labels[type]}</div>
      {children}
    </div>
  );
}

/* ─── Interactive Table ─── */
function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  return (
    <div className="overflow-x-auto my-5 rounded-xl border border-slate-200 dark:border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-[#0a1128]">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr
              key={i}
              onMouseEnter={() => setHoveredRow(i)}
              onMouseLeave={() => setHoveredRow(null)}
              className={cn(
                'transition-all duration-200',
                hoveredRow === i ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
              )}
            >
              {row.map((cell, j) => (
                <td key={j} className={cn(
                  'px-4 py-3 text-slate-700 dark:text-slate-300',
                  j === 0 && 'font-medium text-slate-900 dark:text-white'
                )}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Interactive Feature Card ─── */
function FeatureCard({ icon: Icon, title, description, status }: { icon: any; title: string; description: string; status: 'live' | 'soon' }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative p-5 rounded-xl border transition-all duration-300 cursor-default',
        'bg-white dark:bg-[#0a1128]/60 border-slate-200 dark:border-white/5',
        isHovered && 'border-emerald-500/30 shadow-lg shadow-emerald-500/5 dark:shadow-emerald-500/10 -translate-y-1'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300',
          isHovered ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-100 dark:bg-white/5'
        )}>
          <Icon className={cn('w-5 h-5 transition-colors duration-300', isHovered ? 'text-white' : 'text-slate-600 dark:text-slate-400')} />
        </div>
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full',
          status === 'live' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
        )}>
          {status === 'live' ? '✅ Live' : '🔜 Soon'}
        </span>
      </div>
      <h4 className="font-semibold text-slate-900 dark:text-white mb-1">{title}</h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

/* ─── Interactive Step ─── */
function StepItem({ step, title, desc, isLast }: { step: number; title: string; desc: string; isLast?: boolean }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn(
      'relative flex gap-4 transition-all duration-500',
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
    )} style={{ transitionDelay: `${step * 100}ms` }}>
      {/* Timeline */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300 z-10',
          isVisible ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-500'
        )}>
          {step}
        </div>
        {!isLast && <div className="w-px flex-1 bg-gradient-to-b from-emerald-500/30 to-transparent min-h-[24px]" />}
      </div>

      {/* Content */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex-1 pb-6 cursor-pointer group',
        )}
      >
        <div className="p-4 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 hover:border-emerald-500/20 transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-900 dark:text-white">{title}</div>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', isExpanded && 'rotate-180')} />
          </div>
          <div className={cn(
            'text-sm text-slate-500 dark:text-slate-400 mt-1 overflow-hidden transition-all duration-300',
            isExpanded ? 'max-h-40 opacity-100' : 'max-h-5 opacity-70'
          )}>
            {desc}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Scroll Progress Bar ─── */
function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handler = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return (
    <div className="fixed top-16 left-0 right-0 h-0.5 z-50 bg-slate-200/50 dark:bg-white/5">
      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-150" style={{ width: `${progress}%` }} />
    </div>
  );
}

/* ─── Search Modal ─── */
function SearchModal({ open, onClose, query, setQuery }: { open: boolean; onClose: () => void; query: string; setQuery: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) onClose();
        else { setQuery(''); onClose(); }
      }
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, setQuery]);

  if (!open) return null;

  const allItems = NAV_SECTIONS.flatMap(s => s.children.map(c => ({ ...c, parent: s.label, icon: s.icon })));
  const filtered = query ? allItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()) || item.parent.toLowerCase().includes(query.toLowerCase())) : allItems;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search documentation..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-white/10 text-slate-500 rounded">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No results found for &ldquo;{query}&rdquo;</div>
          ) : filtered.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={onClose}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <item.icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500">{item.parent}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Live Demo Widget ─── */
function LiveDemoWidget() {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [demoStarted, setDemoStarted] = useState(false);

  const demoConvo = [
    { role: 'agent', text: 'Hello! This is Priya from FinEdge Wealth. Am I speaking with Mr. Sharma?' },
    { role: 'user', text: 'Yes, this is Rahul Sharma. Who is this?' },
    { role: 'agent', text: 'I\'m calling about the investment opportunity we sent via email. Did you get a chance to review it?' },
    { role: 'user', text: 'I did glance at it. What kind of returns are we looking at?' },
    { role: 'agent', text: 'Great question! Our senior advisor can walk you through the projected returns. Would Tuesday at 3 PM work for a quick 15-minute call?' },
  ];

  const startDemo = async () => {
    if (demoStarted) return;
    setDemoStarted(true);
    setMessages([]);

    for (let i = 0; i < demoConvo.length; i++) {
      setIsTyping(true);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
      setIsTyping(false);
      setMessages(prev => [...prev, demoConvo[i]]);
      await new Promise(r => setTimeout(r, 400));
    }
  };

  const resetDemo = () => {
    setDemoStarted(false);
    setMessages([]);
    setIsTyping(false);
  };

  return (
    <div className="my-8 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0a1128]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#060e1f]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Live Demo — Agent Conversation</span>
        </div>
        {demoStarted && (
          <button onClick={resetDemo} className="text-xs text-slate-500 hover:text-emerald-500 transition-colors">
            Reset
          </button>
        )}
      </div>
      <div className="p-5 min-h-[200px]">
        {!demoStarted ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <Play className="w-6 h-6 text-white ml-0.5" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs">See how a FinBud AI agent handles a real sales call</p>
            <button
              onClick={startDemo}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all active:scale-95"
            >
              Start Demo Call
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm animate-[fadeSlideUp_0.3s_ease-out]',
                  msg.role === 'user'
                    ? 'bg-emerald-500 text-white rounded-br-md'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 rounded-bl-md'
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-white/5 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(NAV_SECTIONS.map(s => s.id));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');

  // Track scroll position for active section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -60% 0px' }
    );

    const allIds = NAV_SECTIONS.flatMap(s => s.children.map(c => c.id));
    allIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const filteredSections = sidebarSearchQuery
    ? NAV_SECTIONS.map(s => ({
        ...s,
        children: s.children.filter(c =>
          c.label.toLowerCase().includes(sidebarSearchQuery.toLowerCase())
        ),
      })).filter(s => s.children.length > 0)
    : NAV_SECTIONS;

  // Calculate reading progress section
  const allSections = NAV_SECTIONS.flatMap(s => s.children.map(c => c.id));
  const currentIdx = allSections.indexOf(activeSection);
  const readingProgress = allSections.length > 0 ? Math.round(((currentIdx + 1) / allSections.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-[#020617]">
      <ScrollProgress />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} query={searchQuery} setQuery={setSearchQuery} />

      {/* Header */}
      <header className="fixed top-0 w-full z-50 h-16 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-4">
        <button className="lg:hidden text-slate-600 dark:text-slate-300" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white">FinBud<span className="text-emerald-600 dark:text-emerald-400">AI</span></span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">Docs</span>
        </Link>
        <div className="flex-1" />
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-3 w-64 h-9 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-3 pr-2 text-sm text-slate-400 hover:border-emerald-500/30 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search docs...</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-white/10 text-slate-400 rounded border border-slate-200 dark:border-white/10">⌘K</kbd>
        </button>
        <ThemeToggle />
        <Link href="/dashboard" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors">
          Dashboard <ArrowUpRight className="w-3 h-3" />
        </Link>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside className={cn(
          'fixed lg:sticky top-16 h-[calc(100vh-4rem)] w-72 border-r border-slate-200 dark:border-white/5 bg-white/95 dark:bg-[#050d1a]/95 backdrop-blur-xl overflow-y-auto z-40 transition-transform lg:transition-none lg:translate-x-0 flex-shrink-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          {/* Reading progress */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-500 mb-1.5">
              <span>Reading Progress</span>
              <span>{readingProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500" style={{ width: `${readingProgress}%` }} />
            </div>
          </div>

          <div className="p-4 lg:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={sidebarSearchQuery}
                onChange={(e) => setSidebarSearchQuery(e.target.value)}
                className="w-full h-9 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>
          <nav className="p-3 space-y-1">
            {filteredSections.map((section) => (
              <div key={section.id}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  <section.icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform duration-200', expandedSections.includes(section.id) && 'rotate-180')} />
                </button>
                <div className={cn(
                  'overflow-hidden transition-all duration-300',
                  expandedSections.includes(section.id) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                )}>
                  <div className="ml-4 pl-3 border-l-2 border-slate-200 dark:border-white/10 space-y-0.5 mt-1 mb-2">
                    {section.children.map((child) => (
                      <a
                        key={child.id}
                        href={`#${child.id}`}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          'block px-3 py-1.5 rounded-md text-[13px] transition-all duration-200',
                          activeSection === child.id
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium border-l-2 border-emerald-500 -ml-[2px] pl-[14px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                        )}
                      >
                        {child.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </nav>
          <div className="p-4 m-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-emerald-200/80">Need help?</span>
            </div>
            <a href="mailto:support@finbud.ai" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">support@finbud.ai</a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-4xl mx-auto px-6 lg:px-12 py-10">

          {/* ─── HERO SECTION ─── */}
          <div className="mb-12 relative">
            <div className="absolute -top-4 -left-4 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Documentation v2.0</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight mb-4">
                Build Intelligent<br />
                <span className="bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent">Voice Agents</span>
              </h1>
              <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed mb-8">
                Everything you need to create, deploy, and scale AI-powered voice agents for sales, support, and lead qualification.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#quickstart" className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center gap-2 active:scale-95">
                  <Rocket className="w-4 h-4" /> Quick Start
                </a>
                <a href="#api-auth" className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center gap-2">
                  <Code2 className="w-4 h-4" /> API Reference
                </a>
              </div>
            </div>
          </div>

          {/* ─── Stats Banner ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { label: 'API Uptime', value: 99.9, suffix: '%' },
              { label: 'Avg Latency', value: 350, suffix: 'ms' },
              { label: 'Languages', value: 25, suffix: '+' },
              { label: 'Happy Customers', value: 500, suffix: '+' },
            ].map(stat => (
              <div key={stat.label} className="text-center p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* ─── GETTING STARTED ─── */}
          <SectionHeading id="introduction" icon={Zap}>Introduction</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            <strong className="text-slate-900 dark:text-white">FinBud AI</strong> is an enterprise-grade AI voice agent platform that lets you create, configure, and deploy intelligent voice assistants for sales, support, and lead qualification. Our agents can make and receive phone calls, handle complex conversations using custom knowledge bases, and integrate with your existing telephony infrastructure.
          </p>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
            Whether you&apos;re a startup automating outbound sales or an enterprise managing thousands of concurrent calls, FinBud AI scales with your needs.
          </p>

          {/* Feature Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 my-6">
            <FeatureCard icon={Brain} title="AI Voice Agents" description="Create conversational agents with custom personas and voices" status="live" />
            <FeatureCard icon={BookOpen} title="Knowledge Base (RAG)" description="Upload docs, FAQs, URLs for agent context" status="live" />
            <FeatureCard icon={PhoneCall} title="Telephony / SIP" description="Connect Twilio, Exotel, or your own SIP trunks" status="live" />
            <FeatureCard icon={Megaphone} title="Bulk Campaigns" description="Outbound call campaigns with CSV uploads" status="live" />
            <FeatureCard icon={Mic} title="Voice Cloning" description="Clone custom voices via Exote" status="soon" />
            <FeatureCard icon={Globe} title="Web Search Tool" description="Real-time web search during calls" status="soon" />
          </div>

          <SubHeading id="quickstart">Quick Start Guide</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Get your first AI agent running in under 5 minutes:</p>

          <div className="space-y-0">
            {[
              { step: 1, title: 'Create an Account', desc: 'Sign up at finbud.ai or use the demo credentials below. You\'ll get 100 free trial minutes to test everything out.' },
              { step: 2, title: 'Create Your First Agent', desc: 'Navigate to Dashboard → AI Agents → Create New Agent. Choose an industry template or start from scratch with a blank canvas.' },
              { step: 3, title: 'Configure Voice & Prompt', desc: 'Write your system prompt, select a voice provider (Exote, Sarvam AI, or Vapi), and choose a language.' },
              { step: 4, title: 'Add Knowledge', desc: 'Upload PDFs, add FAQ entries, or scrape website URLs to give your agent context about your business.' },
              { step: 5, title: 'Connect Telephony', desc: 'Add a phone number via Twilio or Exotel, or use Web Interface mode for browser-based testing.' },
              { step: 6, title: 'Launch!', desc: 'Deploy your agent and start making/receiving calls. Monitor performance in real-time from your dashboard.' },
            ].map((item, i, arr) => (
              <StepItem key={item.step} {...item} isLast={i === arr.length - 1} />
            ))}
          </div>

          {/* ─── LIVE DEMO ─── */}
          <LiveDemoWidget />

          {/* ─── AI AGENTS ─── */}
          <SectionHeading id="create-agent" icon={Brain}>Creating an Agent</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            AI Agents are the core of FinBud. Each agent has its own persona, voice, knowledge base, and telephony configuration. You can create agents from the dashboard using our step-by-step builder.
          </p>

          <Callout type="tip">
            Start with an <strong>Industry Template</strong> (Finance, Healthcare, Real Estate, Gym &amp; Fitness) to get pre-configured system prompts and greetings. You can customize them afterwards.
          </Callout>

          <CodeBlock
            tabs={[
              { label: 'TypeScript', lang: 'typescript', code: `// Create an agent via API
const response = await fetch('/api/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Sales Rep Priya',
    template_id: 'finance',
    prompt: 'You are a professional financial advisor...',
    greeting: 'Hello, this is Priya from FinEdge Wealth.',
    voice_provider: 'exote',
    voice_id: 'priya',
    language: 'en-IN',
    status: 'active'
  })
});` },
              { label: 'cURL', lang: 'bash', code: `curl -X POST 'https://your-app.com/api/agents' \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sales Rep Priya",
    "template_id": "finance",
    "prompt": "You are a professional financial advisor...",
    "greeting": "Hello, this is Priya from FinEdge Wealth.",
    "voice_provider": "exote",
    "voice_id": "priya",
    "language": "en-IN"
  }'` },
              { label: 'Python', lang: 'python', code: `import requests

response = requests.post(
    'https://your-app.com/api/agents',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={
        'name': 'Sales Rep Priya',
        'template_id': 'finance',
        'prompt': 'You are a professional financial advisor...',
        'greeting': 'Hello, this is Priya from FinEdge Wealth.',
        'voice_provider': 'exote',
        'voice_id': 'priya',
        'language': 'en-IN',
    }
)` },
            ]}
          />

          <SubHeading id="agent-prompts">System Prompts</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            The system prompt defines your agent&apos;s personality, behavior, and conversation flow. A well-crafted prompt is the single most important factor in agent performance.
          </p>

          <Callout type="info">
            Keep prompts under 2000 characters for optimal latency. Use clear bullet points for conversation rules and explicit instructions for when the agent should transfer to a human.
          </Callout>

          <div className="my-5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 dark:bg-[#0a1128] border-b border-slate-200 dark:border-white/5 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">Example System Prompt</span>
            </div>
            <div className="p-5 bg-white dark:bg-[#060e1f] text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-mono">
{`You are Priya, a professional sales representative at FinEdge Wealth Management.

RULES:
- Always be polite and professional
- Qualify the lead by asking about their investment goals
- Never provide specific financial advice
- If they are interested, book a callback with a human advisor
- If they are not interested, thank them and end the call gracefully

CONVERSATION FLOW:
1. Greet the prospect and introduce yourself
2. Ask if they received the brochure
3. Understand their investment timeline
4. Offer to schedule a meeting with a senior advisor
5. Confirm the callback time and end the call`}
            </div>
          </div>

          <SubHeading id="agent-templates">Industry Templates</SubHeading>
          <DocTable
            headers={['Template', 'Use Case', 'Default Voice']}
            rows={[
              ['Finance & Wealth', 'Lead qualification for investment products', 'Priya (Professional Female)'],
              ['Healthcare Clinic', 'Appointment scheduling, patient FAQs', 'Priya (Compassionate Female)'],
              ['Gym & Fitness', 'Free trial bookings, membership upsells', 'Marcus (Energetic Male)'],
              ['Real Estate', 'Property viewing scheduling, buyer qualification', 'Rahul (Professional Male)'],
              ['Custom', 'Blank template — build from scratch', 'Your choice'],
            ]}
          />

          <SubHeading id="agent-voices">Voice & Language</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            FinBud supports multiple TTS (Text-to-Speech) providers to give your agents the perfect voice:
          </p>
          <DocTable
            headers={['Provider', 'Strengths', 'Languages']}
            rows={[
              ['Exote (Premium)', 'Most natural, widest voice library', 'English, Hindi, Spanish, 25+ more'],
              ['Sarvam AI', 'Best for Indian languages', 'Hindi, Tamil, Telugu, Bengali, Marathi, + more'],
              ['Vapi Native', 'Ultra-low latency', 'English (US/UK)'],
            ]}
          />

          {/* ─── KNOWLEDGE BASE ─── */}
          <SectionHeading id="kb-overview" icon={BookOpen}>Knowledge Base Overview</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            The Knowledge Base powers your agent&apos;s ability to answer questions accurately using your company&apos;s data. We use <strong className="text-slate-900 dark:text-white">Retrieval-Augmented Generation (RAG)</strong> — your documents are chunked, embedded, and stored as vectors. During a call, relevant chunks are retrieved and fed to the LLM alongside the conversation.
          </p>
          <Callout type="tip">
            Attach knowledge sources to specific agents in the Agent Builder. An agent will only reference knowledge that is explicitly attached to it.
          </Callout>

          <SubHeading id="kb-upload">Uploading Documents</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Navigate to <strong className="text-slate-900 dark:text-white">Dashboard → Knowledge Base</strong> and select the &quot;PDF&quot; tab. Drag and drop your files (max 10MB per file). Supported formats: <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded text-xs font-mono">.pdf</code>, <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded text-xs font-mono">.txt</code>, <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded text-xs font-mono">.docx</code>.
          </p>

          <SubHeading id="kb-faq">FAQ Entries</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            For structured knowledge, use the Q&amp;A tab to add question-answer pairs directly. These are the most reliable knowledge source because they provide exact answers to expected questions.
          </p>

          <SubHeading id="kb-urls">Website Scraping</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Enter any public URL and FinBud will automatically scrape and index the page content. This is useful for pricing pages, about pages, and product documentation.
          </p>
          <Callout type="warning">
            Website scraping only captures text content. JavaScript-rendered content (SPAs) may not be fully indexed. For best results, provide static HTML pages.
          </Callout>

          {/* ─── TELEPHONY ─── */}
          <SectionHeading id="phone-numbers" icon={PhoneCall}>Phone Numbers</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            You can assign phone numbers to your agents for both inbound and outbound calls. Numbers can be provisioned directly through our platform or brought from your existing telephony provider.
          </p>

          <SubHeading id="sip-trunking">SIP Trunking</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            For enterprise customers with existing PBX infrastructure, FinBud supports SIP trunking. Configure your SIP URIs and credentials in <strong className="text-slate-900 dark:text-white">Dashboard → Settings → Integrations</strong>.
          </p>
          <CodeBlock singleCode={`SIP URI:     sip:your-trunk@sip.twilio.com
Transport:   TLS (recommended) or UDP
Codec:       PCMU (G.711), Opus
DTMF:        RFC 2833`} language="text" />

          <SubHeading id="providers">Supported Providers</SubHeading>
          <DocTable
            headers={['Provider', 'Region', 'Features']}
            rows={[
              ['Twilio', 'Global', 'SIP, WebRTC, phone numbers in 100+ countries'],
              ['Exotel', 'India', 'Local/toll-free, IVR, call masking'],
              ['Knowlarity', 'India', 'Virtual numbers, call tracking'],
              ['Web Interface', 'Global', 'Browser-based WebRTC calls (no phone required)'],
            ]}
          />

          {/* ─── CAMPAIGNS ─── */}
          <SectionHeading id="campaign-overview" icon={Megaphone}>Campaigns Overview</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Campaigns let you run bulk outbound calling operations. Upload a list of contacts, assign an AI agent, schedule the calls, and monitor results in real-time.
          </p>

          <SubHeading id="bulk-calls">Bulk Outbound Calls</SubHeading>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-400 my-4 pl-2">
            <li>Navigate to <strong className="text-slate-900 dark:text-white">Dashboard → Campaigns → New Campaign</strong></li>
            <li>Name your campaign and select a date/time to start</li>
            <li>Upload a CSV file with columns: <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded text-xs font-mono">name, phone, email</code></li>
            <li>Assign an AI Agent to handle the calls</li>
            <li>Set concurrency limits (based on your plan)</li>
            <li>Review and launch</li>
          </ol>
          <Callout type="warning">
            Ensure you have sufficient credits before launching a campaign. Each call minute deducts 1 credit from your balance.
          </Callout>

          <SubHeading id="campaign-analytics">Campaign Analytics</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            After a campaign completes, you can view detailed analytics including call outcomes (interested, not interested, callback, no answer), average call duration, and conversion rates.
          </p>

          {/* ─── API REFERENCE ─── */}
          <SectionHeading id="api-auth" icon={Code2}>API Authentication</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            All API requests are authenticated via JWT tokens. Include the user&apos;s JWT token in the Authorization header for secure access.
          </p>
          <CodeBlock
            tabs={[
              { label: 'cURL', lang: 'bash', code: `curl -X GET 'https://your-app.com/api/agents' \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json"` },
              { label: 'JavaScript', lang: 'javascript', code: `const response = await fetch('https://your-app.com/api/agents', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  }
});
const agents = await response.json();` },
            ]}
          />

          <SubHeading id="api-agents">Agents API</SubHeading>
          <DocTable
            headers={['Method', 'Endpoint', 'Description']}
            rows={[
              ['GET', '/api/agents', 'List all agents for the authenticated user'],
              ['POST', '/api/agents', 'Create a new agent'],
              ['PATCH', '/api/agents?id=eq.{id}', 'Update an existing agent'],
              ['DELETE', '/api/agents?id=eq.{id}', 'Delete an agent'],
            ]}
          />

          <SubHeading id="api-calls">Calls API</SubHeading>
          <DocTable
            headers={['Method', 'Endpoint', 'Description']}
            rows={[
              ['GET', '/api/calls', 'List call logs for the authenticated user'],
              ['POST', '/api/calls/start', 'Initiate an outbound call via agent'],
              ['POST', '/api/calls/token', 'Generate a WebRTC token for browser calls'],
            ]}
          />

          <SubHeading id="api-webhooks">Webhooks</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Configure webhook URLs in <strong className="text-slate-900 dark:text-white">Settings → Integrations</strong> to receive real-time notifications for call events.
          </p>
          <CodeBlock singleCode={`{
  "event": "call.completed",
  "call_id": "uuid-here",
  "agent_id": "uuid-here",
  "duration": 145,
  "outcome": "interested",
  "transcript": [...],
  "recording_url": "https://..."
}`} language="json" />

          {/* ─── BILLING ─── */}
          <SectionHeading id="plans" icon={CreditCard}>Subscription Plans</SectionHeading>
          <DocTable
            headers={['Plan', 'Price (INR/mo)', 'Minutes', 'Agents', 'Concurrent Calls']}
            rows={[
              ['Starter', '₹2,999', '1,000', '3', '2'],
              ['Pro', '₹5,999', '5,000', '10', '5'],
              ['Business', '₹9,999', '20,000', '50', '20'],
              ['Enterprise', '₹19,999', 'Unlimited', 'Unlimited', 'Unlimited'],
            ]}
          />

          <SubHeading id="credits">Credits System</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Credits are consumed based on call duration. <strong className="text-slate-900 dark:text-white">1 credit = 1 minute of call time.</strong> Credits are allocated monthly based on your subscription plan and reset at the beginning of each billing cycle.
          </p>

          <SubHeading id="invoices">Invoices</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            View and download your invoices from <strong className="text-slate-900 dark:text-white">Dashboard → Billing</strong>. All invoices are generated automatically and include GST details for Indian customers.
          </p>

          {/* ─── SECURITY ─── */}
          <SectionHeading id="data-privacy" icon={Shield}>Data Privacy</SectionHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            FinBud AI takes data security seriously. All data is encrypted at rest and in transit. Call recordings and transcripts are stored securely and are only accessible to the account owner.
          </p>

          <SubHeading id="rls">Row Level Security</SubHeading>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            We use Row Level Security (RLS) to ensure complete data isolation between users. Every database query is automatically filtered to only return data owned by the authenticated user.
          </p>
          <CodeBlock singleCode={`-- Example RLS Policy: Users can only view their own agents
CREATE POLICY "Users can view own agents"
  ON agents FOR SELECT
  TO authenticated
  USING ( (SELECT auth.uid()) = user_id );`} language="sql" />

          <SubHeading id="compliance">Compliance</SubHeading>
          <DocTable
            headers={['Standard', 'Status']}
            rows={[
              ['Data Encryption (AES-256)', '✅ Implemented'],
              ['TLS 1.3 for all connections', '✅ Implemented'],
              ['GDPR Data Portability', '✅ Supported'],
              ['SOC 2 Type II', '🔜 In Progress'],
              ['HIPAA', '🔜 Planned for Enterprise'],
            ]}
          />

          {/* Footer */}
          <div className="mt-20 pt-8 border-t border-slate-200 dark:border-white/5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-500">
              <p>&copy; {new Date().getFullYear()} FinBud AI. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <Link href="/" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Home</Link>
                <Link href="/pricing" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Pricing</Link>
                <a href="mailto:support@finbud.ai" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Support</a>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Custom animation keyframe */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
