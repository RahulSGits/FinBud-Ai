'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Loader2, AlertCircle, Check, KeyRound } from 'lucide-react';

const RULES = [
  { label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A number', test: (p: string) => /[0-9]/.test(p) },
];

export function ChangePasswordForm({
  forced, userName, role,
}: {
  forced: boolean;
  userName: string;
  role: 'admin' | 'employee';
}) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unmet = RULES.filter((r) => !r.test(next));
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && unmet.length === 0 && next === confirm && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const d = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(d.error || 'Could not change your password.');
      setBusy(false);
      return;
    }

    // Cleared mustChangePassword server-side; land on the right dashboard.
    router.push(role === 'admin' ? '/admin' : '/dashboard');
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm"
    >
      <div className="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center mb-5">
        <KeyRound className="w-5 h-5 text-white" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        {forced ? 'Set your password' : 'Change your password'}
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        {forced
          ? `Welcome, ${userName.split(' ')[0]}. For security, choose your own password before continuing.`
          : 'Enter your current password and pick a new one.'}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <Field label={forced ? 'Default password' : 'Current password'}>
          <input
            type="password" autoComplete="current-password" autoFocus
            value={current} onChange={(e) => setCurrent(e.target.value)}
            placeholder={forced ? 'Finbud@2026' : ''}
            className={input}
          />
        </Field>

        <Field label="New password">
          <input
            type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)}
            className={input}
          />
        </Field>

        <ul className="space-y-1.5" aria-label="Password requirements">
          {RULES.map((r) => {
            const met = r.test(next);
            return (
              <li key={r.label} className="flex items-center gap-2 text-xs">
                <span className={met
                  ? 'w-4 h-4 rounded-full bg-brand-500/15 flex items-center justify-center'
                  : 'w-4 h-4 rounded-full border border-slate-300 dark:border-white/15'}>
                  {met && <Check className="w-2.5 h-2.5 text-brand-600 dark:text-brand-400" />}
                </span>
                <span className={met ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}>
                  {r.label}
                </span>
              </li>
            );
          })}
        </ul>

        <Field label="Confirm new password">
          <input
            type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch} className={input}
          />
          {mismatch && <p className="text-xs text-red-500 mt-1.5">Passwords don&apos;t match.</p>}
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <button type="submit" disabled={!canSubmit}
          className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {forced ? 'Save and continue' : 'Update password'}
        </button>
      </form>
    </motion.div>
  );
}

const input =
  'w-full h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
