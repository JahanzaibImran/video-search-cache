import type { CacheStore } from "./types";

/** What actually sits in the store: the payload plus when it was fetched upstream. */
export interface CachedValue<T> {
  value: T;
  /** Epoch ms of the upstream fetch that produced `value`. */
  fetchedAt: number;
}

/**
 * Where a result came from:
 * - `cache`:    served from the store; no upstream call.
 * - `upstream`: this caller ran the fetcher (the only case that costs anything).
 * - `inflight`: joined a fetch another caller had already started for the same key.
 */
export type CacheSource = "cache" | "upstream" | "inflight";

export interface CachedResult<T> extends CachedValue<T> {
  key: string;
  source: CacheSource;
}

export type GetOrFetch = <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
) => Promise<CachedResult<T>>;

export interface CachedFetch {
  getOrFetch: GetOrFetch;
  /** Number of upstream fetches currently in progress (useful for tests and metrics). */
  inflightCount: () => number;
}

/**
 * Builds a cache-aside `getOrFetch` bound to a store.
 *
 * The in-flight map is what stops a "thundering herd": while one fetch for a key
 * is pending, every other caller for that key awaits the same promise instead of
 * calling upstream again. The map is per-process. Across many instances you'd add
 * a distributed lock (e.g. Redis SET NX) if duplicate fetches are expensive enough.
 */
export function createCachedFetch(
  store: CacheStore,
  options: { now?: () => number } = {},
): CachedFetch {
  const now = options.now ?? Date.now;
  const inflight = new Map<string, Promise<CachedValue<unknown>>>();

  async function getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number,
  ): Promise<CachedResult<T>> {
    const cached = await store.get<CachedValue<T>>(key);
    if (cached) return { ...cached, key, source: "cache" };

    // The check and the `set` below run synchronously (no await in between),
    // so two concurrent misses can never both start a fetch in this process.
    const pending = inflight.get(key) as Promise<CachedValue<T>> | undefined;
    if (pending) return { ...(await pending), key, source: "inflight" };

    const fetchAndStore = async (): Promise<CachedValue<T>> => {
      const value = await fetcher();
      const entry: CachedValue<T> = { value, fetchedAt: now() };
      await store.set(key, entry, ttlMs);
      return entry;
    };

    const promise = fetchAndStore();
    inflight.set(key, promise);
    try {
      return { ...(await promise), key, source: "upstream" };
    } finally {
      // Runs on success and failure alike. A rejected fetch is never stored,
      // so the next caller retries instead of being served a cached error.
      inflight.delete(key);
    }
  }

  return { getOrFetch, inflightCount: () => inflight.size };
}
