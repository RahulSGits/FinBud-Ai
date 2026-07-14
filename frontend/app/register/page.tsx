'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', company: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.fullName, form.company);
    setLoading(false);
    if (error) { setError(error); return; }
    toast.success('Account created! Welcome to FinBud.');
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex">
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
          <h2 className="text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-4">Scale your outbound<br/><span className="text-emerald-600 dark:text-emerald-400">10x faster.</span></h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10">Join hundreds of companies using FinBud AI agents for sales, lead qualification, and customer follow-ups.</p>
          {['Free 7-day trial, no card needed', '100 free calling minutes included', 'Full access to agent builder & campaigns'].map(i => (
            <div key={i} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />{i}
            </div>
          ))}
        </div>
      </div>

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create your account</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Free 7-day trial · No credit card required</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Full Name</Label>
                <Input placeholder="John Smith" value={form.fullName} onChange={set('fullName')} required
                  className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 focus:border-emerald-500/50" />
              </div>
              <div>
                <Label className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Company</Label>
                <Input placeholder="Acme Corp" value={form.company} onChange={set('company')} required
                  className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 focus:border-emerald-500/50" />
              </div>
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Work Email</Label>
              <Input type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required
                className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 focus:border-emerald-500/50" />
            </div>
            <div>
              <Label className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Password</Label>
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} placeholder="Min. 8 characters" value={form.password} onChange={set('password')} required
                  className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11 pr-10 focus:border-emerald-500/50" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-200">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 font-medium shadow-lg shadow-emerald-500/20 mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? 'Creating account...' : 'Create Free Account'}
            </Button>
            <p className="text-xs text-slate-600 dark:text-slate-500 text-center">By signing up you agree to our <Link href="#" className="text-slate-500 dark:text-slate-400 hover:text-slate-200">Terms</Link> and <Link href="#" className="text-slate-500 dark:text-slate-400 hover:text-slate-200">Privacy Policy</Link></p>
          </form>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
            Already have an account? <Link href="/login" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
