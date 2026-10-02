import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCachedFetch, type CachedFetch } from "./cached-fetch";
import { InMemoryCacheStore } from "./memory-store";

/** A promise we can resolve or reject from the outside, to control interleaving. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TTL = 60_000;

describe("getOrFetch", () => {
  let now: number;
  let store: InMemoryCacheStore;
  let cache: CachedFetch;

  beforeEach(() => {
    now = 1_700_000_000_000;
    store = new InMemoryCacheStore({ now: () => now });
    cache = createCachedFetch(store, { now: () => now });
  });

  it("calls the fetcher on a miss and stores the value with a fetchedAt timestamp", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });

    const result = await cache.getOrFetch("k", fetcher, TTL);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ key: "k", value: { id: 1 }, fetchedAt: now, source: "upstream" });
    expect(await store.get("k")).toEqual({ value: { id: 1 }, fetchedAt: now });
  });

  it("serves a hit from the store without calling the fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    await cache.getOrFetch("k", fetcher, TTL);
    const firstFetchedAt = now;

    now += 5_000;
    const result = await cache.getOrFetch("k", fetcher, TTL);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.source).toBe("cache");
    expect(result.fetchedAt).toBe(firstFetchedAt); // reports the original fetch time, not "now"
  });

  it("refetches after the TTL expires", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    await cache.getOrFetch("k", fetcher, TTL);

    now += TTL;
    const result = await cache.getOrFetch("k", fetcher, TTL);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ value: "new", source: "upstream" });
  });

  it("dedupes concurrent misses for the same key into exactly one fetcher call", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    const first = cache.getOrFetch("k", fetcher, TTL);
    const second = cache.getOrFetch("k", fetcher, TTL);
    // Let both callers get past their (async) store lookup before the fetch resolves.
    await vi.waitFor(() => expect(cache.inflightCount()).toBe(1));
    gate.resolve("shared");

    const results = await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(results.map((r) => r.value)).toEqual(["shared", "shared"]);
    expect(results.map((r) => r.source).sort()).toEqual(["inflight", "upstream"]);
    expect(cache.inflightCount()).toBe(0);
  });

  it("does not dedupe across different keys", async () => {
    const fetcher = vi.fn(async () => "v");

    await Promise.all([cache.getOrFetch("a", fetcher, TTL), cache.getOrFetch("b", fetcher, TTL)]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache errors, and a failed fetch can be retried", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.getOrFetch("k", fetcher, TTL)).rejects.toThrow("upstream down");
    expect(await store.get("k")).toBeUndefined();
    expect(cache.inflightCount()).toBe(0);

    const retry = await cache.getOrFetch("k", fetcher, TTL);
    expect(retry).toMatchObject({ value: "recovered", source: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects every concurrent waiter when the shared fetch fails, then allows a retry", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    const first = cache.getOrFetch("k", fetcher, TTL);
    const second = cache.getOrFetch("k", fetcher, TTL);
    await vi.waitFor(() => expect(cache.inflightCount()).toBe(1));
    gate.reject(new Error("boom"));

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(fetcher).toHaveBeenCalledOnce();

    const retry = await cache.getOrFetch("k", async () => "ok", TTL);
    expect(retry.source).toBe("upstream");
  });
});
