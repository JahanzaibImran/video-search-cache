/**
 * Minimal key-value contract the rest of the app depends on.
 *
 * Every method is async on purpose: an in-memory map doesn't need it, but a
 * network-backed store does, and keeping the signature async means swapping
 * implementations never touches callers. Values must be JSON-serialisable.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  /** `ttlMs` omitted means "never expires". */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
