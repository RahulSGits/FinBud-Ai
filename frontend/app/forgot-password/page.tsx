'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Phone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Phone className="w-5 h-5 text-slate-900 dark:text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white">FinBud <span className="text-emerald-600 dark:text-emerald-400">AI</span></span>
        </Link>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-white/8 rounded-2xl p-8">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">If an account exists for {email}, you&apos;ll receive a password reset link.</p>
              <Link href="/login"><Button variant="outline" className="border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:bg-white/5">Back to login</Button></Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reset password</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Enter your email and we&apos;ll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-slate-600 dark:text-slate-300 text-sm mb-1.5 block">Email</Label>
                  <Input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required
                    className="bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 h-11" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
              <p className="text-center text-slate-600 dark:text-slate-500 text-sm mt-4">
                Remember it? <Link href="/login" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-300">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
