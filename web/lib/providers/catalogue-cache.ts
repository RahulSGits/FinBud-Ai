// A small in-process cache for provider catalogues.
//
// Voice, model and language lists are effectively static — a vendor adds a
// voice every few weeks — but they were being fetched from OmniDimension on
// every render of the agents pages and every open of the agent builder. That is
// a blocking round trip to another continent on a screen that has nothing to do
// with it, and it happens before a single pixel is sent.
//
// Deliberately in-memory rather than a Next data-cache entry or a Setting row:
// this must not be a database write on a read path, and the correct behaviour
// after a deploy is simply to fetch once more. Each serverless instance warms
// its own copy on first use and shares it across every request it then serves.
//
// Stale-on-error is the point. When the vendor is down, an agent list that
// shows voice names from ten minutes ago is strictly better than one that
// renders raw ids — and far better than a page that fails.

interface Entry<T> {
  value: T;
  /** When the value stops being served without a refresh. */
  freshUntil: number;
  /** Set while a refresh is in flight, so ten callers make one request. */
  inFlight?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

/** How long a catalogue is served without asking the provider again. */
const TTL_MS = 10 * 60_000;

/**
 * Return a cached catalogue, fetching only when it has gone stale.
 *
 * On a refresh failure the previous value is kept and returned. Only the very
 * first call for a key can throw, because only then is there nothing to fall
 * back to — and the callers of this already treat that as "show the ids".
 */
export async function cachedCatalogue<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && hit.freshUntil > now) return hit.value;

  // Collapse a stampede: the first caller fetches, the rest await the same
  // promise instead of opening their own connection to the vendor.
  if (hit?.inFlight) return hit.inFlight;

  const inFlight = load()
    .then((value) => {
      store.set(key, { value, freshUntil: Date.now() + TTL_MS });
      return value;
    })
    .catch((err) => {
      if (hit) {
        // Serve the stale copy, and try again on the next request rather than
        // pinning a failure for the whole TTL.
        store.set(key, { value: hit.value, freshUntil: 0 });
        return hit.value;
      }
      store.delete(key);
      throw err;
    });

  if (hit) store.set(key, { ...hit, inFlight });
  return inFlight;
}

/** Drop cached catalogues — used when the provider credential changes. */
export function clearCatalogues(): void {
  store.clear();
}
