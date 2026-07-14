import { PhoneCall, Phone, Twitter, Github, Linkedin, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#020617] pt-20 pb-12 px-6 relative z-10 overflow-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6 inline-flex">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Phone className="w-5 h-5 text-slate-900 dark:text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">FinBud<span className="text-emerald-600 dark:text-emerald-400">AI</span></span>
            </Link>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6 max-w-sm">
              The world&apos;s most advanced conversational AI platform designed for enterprise inbound and outbound voice operations. Featuring sub-second latency and deeply integrated regional dialects.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://twitter.com/finbud" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-emerald-500 hover:text-slate-900 dark:hover:text-white hover:border-emerald-500 transition-all">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://github.com/finbud" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-emerald-500 hover:text-slate-900 dark:hover:text-white hover:border-emerald-500 transition-all">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://linkedin.com/company/finbud" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-emerald-500 hover:text-slate-900 dark:hover:text-white hover:border-emerald-500 transition-all">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Links Columns */}
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-6">Platform</h4>
            <ul className="space-y-4">
              <li><Link href="/why" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Why FinBud?</Link></li>
              <li><Link href="/how-it-works" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">How it Works</Link></li>
              <li><Link href="/pricing" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Pricing & Plans</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Integrations</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Security</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-6">Resources</h4>
            <ul className="space-y-4">
              <li><a href="/docs" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Documentation</a></li>
              <li><a href="/docs#api-reference" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">API Reference</a></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Blog</Link></li>
              <li><Link href="/faq" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Help Center / FAQ</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Community Discord</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold mb-6">Company</h4>
            <ul className="space-y-4">
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">About Us</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Careers</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Contact</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-600 dark:text-slate-500 text-sm">
            © {new Date().getFullYear()} FinBud AI Technologies. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
