// Small in-memory failure throttle.
//
// Guards credential endpoints against online guessing. In-memory is a
// deliberate trade-off: on a long-lived server it is exact, and on Vercel's
// reused function instances it still throttles any sustained attack from one
// deployment region, without buying a Redis just for the login form. It resets
// on cold start — acceptable, because the cost of a miss is a handful of extra
// bcrypt comparisons at 12 rounds, each ~100ms of attacker-paid latency.
//
// Failures are counted per key; successes clear the key. Nothing is recorded
// for successful sign-ins, so this stores no behavioural history.

interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

const buckets = new Map<string, Bucket>();

/** Drop stale buckets so the map cannot grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 10_000) return;
  buckets.forEach((bucket, key) => {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  });
}

/** True when this key has failed too often and must wait out the window. */
export function isThrottled(key: string): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (Date.now() - bucket.windowStart > WINDOW_MS) {
    buckets.delete(key);
    return false;
  }
  return bucket.count >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  bucket.count += 1;
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** Minutes left in the window, for the error message. */
export function retryAfterMinutes(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - Date.now()) / 60_000));
}
