import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCacheStore } from "./memory-store";

describe("InMemoryCacheStore", () => {
  let now: number;
  let store: InMemoryCacheStore;

  beforeEach(() => {
    now = 1_000_000;
    store = new InMemoryCacheStore({ now: () => now });
  });

  it("returns undefined on a miss", async () => {
    expect(await store.get("missing")).toBeUndefined();
  });

  it("returns the stored value on a hit", async () => {
    await store.set("k", { title: "hello" }, 1_000);
    expect(await store.get("k")).toEqual({ title: "hello" });
  });

  it("serves the value until the TTL elapses, then expires it", async () => {
    await store.set("k", "v", 1_000);

    now += 999;
    expect(await store.get("k")).toBe("v");

    now += 1;
    expect(await store.get("k")).toBeUndefined();
    expect(store.size).toBe(0); // the expired entry is removed, not just hidden
  });

  it("keeps entries without a TTL indefinitely", async () => {
    await store.set("k", "v");
    now += 1_000 * 60 * 60 * 24 * 365;
    expect(await store.get("k")).toBe("v");
  });

  it("resets the TTL when a key is overwritten", async () => {
    await store.set("k", "old", 1_000);
    now += 900;
    await store.set("k", "new", 1_000);
    now += 900;
    expect(await store.get("k")).toBe("new");
  });

  it("deletes entries", async () => {
    await store.set("k", "v");
    await store.delete("k");
    expect(await store.get("k")).toBeUndefined();
  });

  it("isolates cached values from caller mutation", async () => {
    const value = { items: [1, 2] };
    await store.set("k", value);
    value.items.push(3);

    const read = await store.get<{ items: number[] }>("k");
    read?.items.push(4);

    expect(await store.get("k")).toEqual({ items: [1, 2] });
  });

  it("evicts the oldest entry when maxEntries is exceeded", async () => {
    const small = new InMemoryCacheStore({ maxEntries: 2 });
    await small.set("a", 1);
    await small.set("b", 2);
    await small.set("c", 3);

    expect(await small.get("a")).toBeUndefined();
    expect(await small.get("b")).toBe(2);
    expect(await small.get("c")).toBe(3);
  });

  it("rejects non-positive TTLs", async () => {
    await expect(store.set("k", "v", 0)).rejects.toThrow(RangeError);
    await expect(store.set("k", "v", -5)).rejects.toThrow(RangeError);
  });
});
