'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Play, Pause, Square, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  campaignId: string;
  status: string;
  liveCalls: number;
  remaining: number;
  /**
   * Whether this viewer may drive the campaign. False turns the component into
   * a read-only status badge — and, importantly, stops the tick loop: the tick
   * endpoint advances *every* running campaign, so a page that merely lists
   * someone else's work has no business calling it.
   */
  canControl?: boolean;
}

const TONE: Record<string, string> = {
  draft: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  running: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  paused: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  scheduled: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

export function CampaignControls({
  campaignId,
  status,
  liveCalls,
  remaining,
  canControl = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // While running, keep ticking the runner so the campaign progresses even
  // without a separate scheduler configured.
  useEffect(() => {
    if (!canControl || status !== 'running') return;
    const t = setInterval(async () => {
      await fetch('/api/campaigns/tick', { method: 'POST' }).catch(() => {});
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [canControl, status, router]);

  async function control(action: 'start' | 'pause' | 'resume' | 'stop') {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();

      if (!res.ok) {
        toast.error(d.error || `Could not ${action} the campaign`);
      } else if (d.notice) {
        setNotice(d.notice);
        toast.warning(d.notice);
      } else if (action === 'start' || action === 'resume') {
        toast.success(`Dialling ${d.dialled} call${d.dialled === 1 ? '' : 's'}${d.mock ? ' (simulated)' : ''}`);
      } else {
        toast.success(`Campaign ${d.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium capitalize', TONE[status] ?? TONE.draft)}>
          {status}
        </span>
        {/* Without buttons the pill alone says very little, so a read-only view
            keeps the queue depth visible even when nothing is dialling. */}
        {(liveCalls > 0 || (!canControl && remaining > 0)) && (
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {liveCalls} live · {remaining} queued
          </span>
        )}

        {!canControl ? null : status === 'running' ? (
          <>
            <button onClick={() => control('pause')} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Pause
            </button>
            <button onClick={() => control('stop')} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50">
              <Square className="w-4 h-4" /> Stop
            </button>
          </>
        ) : status !== 'completed' ? (
          <button onClick={() => control(status === 'paused' ? 'resume' : 'start')} disabled={busy}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {status === 'paused' ? 'Resume' : 'Start calling'}
          </button>
        ) : null}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">{notice}</p>
        </div>
      )}
    </div>
  );
}
