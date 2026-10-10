import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Costs from "@/lib/credits/costs";

/**
 * Regression test for the "I changed the price and nothing happened" bug.
 * `vi.resetModules()` + a fresh import is what a Next.js dev hot reload does:
 * modules re-run, but anything on `globalThis` survives.
 */
async function loadContainerWithPrice(searchPrice: number) {
  vi.resetModules();
  vi.doMock("@/lib/credits/costs", async (importOriginal) => {
    const real = await importOriginal<typeof Costs>();
    return { ...real, CREDIT_COSTS: { ...real.CREDIT_COSTS, search: searchPrice } };
  });
  return import("./container");
}

describe("container across a dev hot reload", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("CREDIT_LIMIT", "100");
  });

  afterEach(async () => {
    (await import("./container")).resetContainer();
    vi.doUnmock("@/lib/credits/costs");
  });

  it("charges the new price after the cost file is edited, without losing balances", async () => {
    const before = await loadContainerWithPrice(1);
    await before.getContainer().ledger.charge({ userId: "alice", action: "search", cacheKey: "a" });

    const after = await loadContainerWithPrice(7);
    const { ledger } = after.getContainer();
    await ledger.charge({ userId: "alice", action: "search", cacheKey: "b" });

    // 1 (old price, kept) + 7 (new price, applied immediately). Before the fix this was 1 + 1.
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 8, remaining: 92 });
  });

  it("resetContainer clears persisted state too", async () => {
    const mod = await loadContainerWithPrice(1);
    await mod.getContainer().ledger.charge({ userId: "alice", action: "search", cacheKey: "a" });

    mod.resetContainer();

    expect(await mod.getContainer().ledger.getUsage("alice")).toMatchObject({ used: 0 });
  });
});
