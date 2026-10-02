import type { CacheStore } from "./types";

interface Entry {
  value: unknown;
  /** Epoch ms after which the entry is stale, or `null` for no expiry. */
  expiresAt: number | null;
}

export interface InMemoryCacheStoreOptions {
  /** Clock override, used by tests to move time forward deterministically. */
  now?: () => number;
  /** Upper bound on entries; the oldest-written entry is evicted first. */
  maxEntries?: number;
}

/**
 * Process-local `CacheStore` with per-entry TTL.
 *
 * Fine for a single Node process and for tests. It is not shared between
 * serverless instances and is lost on restart.
 *
 * Redis would plug in here: a `RedisCacheStore implements CacheStore` that maps
 * `get` -> GET + JSON.parse, `set` -> SET key value PX ttlMs, and `delete` -> DEL.
 * Expiry is then handled by Redis itself instead of the lazy check below.
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: InMemoryCacheStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 1_000;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Clone so callers can't mutate what's cached, mirroring a serialising store like Redis.
    return structuredClone(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs <= 0)) {
      throw new RangeError(`ttlMs must be a positive number, got ${ttlMs}`);
    }
    // Re-inserting moves the key to the end of the Map's insertion order.
    this.entries.delete(key);
    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: ttlMs === undefined ? null : this.now() + ttlMs,
    });
    this.evictOverflow();
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Number of stored entries, including any not yet lazily expired. */
  get size(): number {
    return this.entries.size;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}
