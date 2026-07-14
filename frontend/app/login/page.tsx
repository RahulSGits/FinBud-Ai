'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, Eye, EyeOff, Loader2, AlertCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, signIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) { setError(error); return; }
    toast.success('Welcome back!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[460px] relative overflow-hidden p-10">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-100/50 to-white/30 dark:from-emerald-950/40 dark:to-slate-950/80" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.15),transparent_60%)]" />
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2.5 mb-16">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Phone className="w-5 h-5 text-slate-900 dark:text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">FinBud <span className="text-emerald-600 dark:text-emerald-400">AI</span></span>
          </Link>
          <h2 className="text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-4">AI Voice Agents<br/><span className="text-emerald-600 dark:text-emerald-400">that Close Deals.</span></h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10">Automate thousands of outbound calls with human-sounding AI agents. Built for scale, optimized to convert.</p>
          <div className="space-y-4">
            {[
              { label: '10x more calls than a human team', icon: '📞' },
              { label: 'Real-time transcripts & call outcomes', icon: '📋' },
              { label: 'Bulk campaign management', icon: '🚀' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="text-lg">{item.icon}</span>{item.label}
              </div>
            ))}
          </div>
          <div className="mt-16 p-4 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"><Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /></div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">Demo accounts ready</div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Try <span className="text-emerald-600 dark:text-emerald-400 font-mono">demo@finbud.ai / demo123</span> or <span className="text-emerald-600 dark:text-emerald-400 font-mono">admin@finbud.ai / admin123</span></p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Phone className="w-4 h-4 text-slate-900 dark:text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-white">FinBud AI</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Sign in to your FinBud account</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required
                className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 focus:border-emerald-500/50 focus:ring-emerald-500/20" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="text-slate-600 dark:text-slate-300 text-sm">Password</Label>
                <Link href="/forgot-password" className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-300">Forgot?</Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                  className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 pr-10 focus:border-emerald-500/50 focus:ring-emerald-500/20" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-200">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 font-medium shadow-lg shadow-emerald-500/20">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-8">
            No account? <Link href="/register" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-300 font-medium">Start free trial</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
