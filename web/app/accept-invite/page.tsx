'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Phone, ShieldCheck, AlertCircle, Check } from 'lucide-react';
import { motion } from 'motion/react';

const RULES = [
  { label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A number', test: (p: string) => /[0-9]/.test(p) },
];

function AcceptInviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validate the token before showing the form, so an expired link fails
  // immediately rather than after the user has chosen a password.
  useEffect(() => {
    if (!token) {
      setError('This link is missing its invitation token.');
      setChecking(false);
      return;
    }

    fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'This invitation is invalid or has expired.');
        setInvite({ email: d.email, name: d.name });
      })
      .catch((e) => setError(e.message))
      .finally(() => setChecking(false));
  }, [token]);

  const unmet = RULES.filter((r) => !r.test(password));
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = unmet.length === 0 && password === confirm && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || 'Could not set your password.');
      setSubmitting(false);
      return;
    }

    // Accepting signs the user in, so go straight to their dashboard.
    router.push(data.user?.role === 'admin' ? '/admin' : '/dashboard');
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking your invitation…</span>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          This invitation can&apos;t be used
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{error}</p>
        <p className="text-xs text-slate-500">
          Ask an administrator to send you a new invitation.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm"
    >
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center">
          <Phone className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900 dark:text-white">Finance Buddha</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        Welcome{invite.name ? `, ${invite.name.split(' ')[0]}` : ''}
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        Choose a password to activate <span className="font-medium">{invite.email}</span>
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <ul className="space-y-1.5" aria-label="Password requirements">
          {RULES.map((r) => {
            const met = r.test(password);
            return (
              <li key={r.label} className="flex items-center gap-2 text-xs">
                <span
                  className={
                    met
                      ? 'w-4 h-4 rounded-full bg-brand-500/15 flex items-center justify-center'
                      : 'w-4 h-4 rounded-full border border-slate-300 dark:border-white/15'
                  }
                >
                  {met && <Check className="w-2.5 h-2.5 text-brand-600 dark:text-brand-400" />}
                </span>
                <span className={met ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}>
                  {r.label}
                </span>
              </li>
            );
          })}
        </ul>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            className="w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {mismatch && <p className="text-xs text-red-500 mt-1.5">Passwords don&apos;t match.</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Activate account
        </button>
      </form>
    </motion.div>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#020617]">
      <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-slate-400" />}>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
