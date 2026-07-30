'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mail, UserPlus, Loader2, X, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * `variant` exists so this can sit next to the primary "Add employee" button
 * without two solid buttons competing for the same emphasis.
 */
export function InviteMember({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', employeeId: '', role: 'employee' });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFallbackUrl(null);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();

      if (!res.ok) {
        toast.error(d.error || 'Could not send the invitation');
        return;
      }

      if (d.emailSent) {
        toast.success(`Invitation emailed to ${form.email}`);
        setOpen(false);
        setForm({ name: '', email: '', employeeId: '', role: 'employee' });
      } else {
        // Never claim an email was sent when it wasn't — hand over the link.
        toast.warning('Email not sent — copy the link below instead');
        setFallbackUrl(d.inviteUrl ?? null);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm transition-colors',
          variant === 'secondary'
            ? 'border border-slate-200 dark:border-white/10 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
            : 'bg-brand-600 hover:bg-brand-500 text-white font-semibold'
        )}
      >
        {variant === 'secondary' ? <Mail className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        Invite by email
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !busy && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Invite a team member</h2>
                <button onClick={() => setOpen(false)} className="p-1 -mr-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                They receive an email link to choose their own password — you never set it. Use
                “Add employee” instead to create the account right now with the shared default
                password.
              </p>

              <form onSubmit={submit} className="space-y-4">
                <Field label="Full name" required>
                  <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                    placeholder="Anita Sharma" className={input} />
                </Field>
                <Field label="Email" required>
                  <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                    placeholder="anita@financebuddha.com" className={input} />
                </Field>
                <Field label="Employee ID" hint="Optional. They can sign in with this instead of their email.">
                  <input value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)}
                    placeholder="FB-014" className={input} />
                </Field>
                <Field label="Role">
                  <select value={form.role} onChange={(e) => set('role', e.target.value)} className={input}>
                    <option value="employee">Employee — works their assigned leads</option>
                    <option value="admin">Admin — full access, can invite others</option>
                  </select>
                </Field>

                {fallbackUrl && (
                  <div className="rounded-xl bg-amber-500/10 p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                      Send this link to them directly:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] break-all text-amber-800 dark:text-amber-200">{fallbackUrl}</code>
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText(fallbackUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={busy}
                  className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Send invitation
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const input =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
