'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface UseLiveRefreshOptions {
  /** Poll only while something is actually in flight. Flip to false and the loop stops dead. */
  enabled: boolean;
  intervalMs: number;
  /**
   * Runs before each `router.refresh()`. Use it to pull provider-side results
   * into the database, so the re-render that follows has something new to show.
   * Anything it throws is swallowed — the loop must outlive a bad response.
   */
  onTick?: () => void | Promise<void>;
}

export interface UseLiveRefreshResult {
  /** True while a tick is running, including the server round trip it triggers. */
  pending: boolean;
  /** Epoch ms at which fresh data last landed. Null until the first tick completes. */
  lastUpdatedAt: number | null;
}

/**
 * Freshness line for a self-refreshing view, e.g. "updated 12s ago".
 *
 * Lives here rather than in each component so every polling surface words it
 * the same way.
 */
export function freshnessLabel(at: number | null, now: number): string {
  if (at === null) return 'updated just now';

  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 2) return 'updated just now';
  if (secs < 60) return `updated ${secs}s ago`;

  const mins = Math.floor(secs / 60);
  return `updated ${mins}m ago`;
}

/**
 * Keep a server-rendered view current without a reload.
 *
 * Each tick runs `onTick` and then `router.refresh()`, which re-runs the server
 * components for the current route — so the page's own queries stay the single
 * source of truth and no data has to be duplicated into client state.
 *
 * Three things it refuses to do, all of which are how naive polling goes wrong:
 * it does not run in a hidden tab (a background tab hammering a provider-backed
 * endpoint burns quota and rate limits for a view nobody is looking at), it
 * skips rather than queues a tick while the previous one is still in flight, and
 * it never lets a failed request stop the loop or reach the user as a toast.
 */
export function useLiveRefresh({
  enabled,
  intervalMs,
  onTick,
}: UseLiveRefreshOptions): UseLiveRefreshResult {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [ticking, setTicking] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Both held in refs so the interval below survives a re-render: callers can
  // pass an inline closure, and nothing restarts the clock — an interval torn
  // down and rebuilt on every refresh would never actually reach its period.
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      // Skip, never queue: a slow provider must not leave a backlog of ticks
      // that all fire at once the moment it finally answers.
      if (cancelled || inFlight || document.visibilityState !== 'visible') return;

      inFlight = true;
      setTicking(true);
      try {
        await onTickRef.current?.();
        if (cancelled) return;
        // Inside a transition so `pending` covers the re-render too, not just
        // the request above.
        startTransition(() => routerRef.current.refresh());
      } catch {
        // Deliberately silent. One dropped poll is not worth a toast every few
        // seconds, and the next tick retries anyway.
      } finally {
        inFlight = false;
        setTicking(false);
      }
    };

    const start = () => {
      if (timer === null) timer = setInterval(() => void tick(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Catch up straight away: the view is stale by however long the tab was away.
        void tick();
        start();
      } else {
        stop();
      }
    };

    // Alt-tabbing back to a window that never stopped being "visible" does not
    // fire visibilitychange, so refresh on focus as well.
    const onFocus = () => {
      if (document.visibilityState === 'visible') void tick();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      setTicking(false);
    };
  }, [enabled, intervalMs, startTransition]);

  // Stamped when the refresh has actually landed, so "updated Ns ago" describes
  // the data on screen rather than the moment a request left.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) setLastUpdatedAt(Date.now());
    wasRefreshing.current = isRefreshing;
  }, [isRefreshing]);

  return { pending: ticking || isRefreshing, lastUpdatedAt };
}
