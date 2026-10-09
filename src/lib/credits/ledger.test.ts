import { describe, expect, it, vi } from "vitest";
import { CREDIT_COSTS, type CreditCosts } from "./costs";
import { CreditLimitError } from "./errors";
import {
  createLedgerState,
  InMemoryCreditLedger,
  withCredit,
  type InMemoryCreditLedgerOptions,
} from "./ledger";
import type { ChargeInput, CreditAction } from "./types";

const charge = (action: CreditAction, userId = "alice", cacheKey = `k:${action}`): ChargeInput => ({
  userId,
  action,
  cacheKey,
});
const searchCharge = (userId = "alice", cacheKey = "yt:search:cats") =>
  charge("search", userId, cacheKey);

/** Counting tests use a flat price of 1 so the arithmetic stays obvious. */
const FLAT: CreditCosts = { search: 1, videoDetails: 1, comments: 1, transcript: 1 };
/** Distinct prices per action, independent of whatever `costs.ts` says today. */
const PRICED: CreditCosts = { search: 3, videoDetails: 1, comments: 2, transcript: 2 };

const ledgerWith = (options: InMemoryCreditLedgerOptions = {}) =>
  new InMemoryCreditLedger({ costs: FLAT, ...options });

describe("InMemoryCreditLedger", () => {
  it("defaults to a limit of 20 and the prices in costs.ts", async () => {
    const ledger = new InMemoryCreditLedger();
    expect(await ledger.getUsage("alice")).toEqual({ used: 0, limit: 20, remaining: 20 });
    expect(ledger.costs).toBe(CREDIT_COSTS);
  });

  it("records userId, action, cache key, amount and timestamp on each charge", async () => {
    const ledger = ledgerWith({ now: () => 1234 });

    await ledger.charge({ userId: "alice", action: "comments", cacheKey: "yt:comments:abc" });

    expect(await ledger.getEntries("alice")).toEqual([
      expect.objectContaining({
        userId: "alice",
        action: "comments",
        cacheKey: "yt:comments:abc",
        timestamp: 1234,
        amount: 1,
        kind: "charge",
      }),
    ]);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 1, remaining: 19 });
  });

  it("throws CreditLimitError once the limit is reached", async () => {
    const ledger = ledgerWith({ limit: 2 });
    await ledger.charge(searchCharge());
    await ledger.charge(searchCharge());

    const attempt = ledger.charge(searchCharge());

    await expect(attempt).rejects.toBeInstanceOf(CreditLimitError);
    await expect(attempt).rejects.toMatchObject({
      code: "CREDIT_LIMIT_REACHED",
      usage: { used: 2, limit: 2, remaining: 0 },
    });
    expect(await ledger.getEntries("alice")).toHaveLength(2);
  });

  it("can't be overspent by concurrent charges", async () => {
    const ledger = ledgerWith({ limit: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => ledger.charge(searchCharge("alice", `k${i}`))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 3, remaining: 0 });
  });

  it("tracks each user's credits independently", async () => {
    const ledger = ledgerWith({ limit: 1 });
    await ledger.charge(searchCharge("alice"));

    await expect(ledger.charge(searchCharge("alice"))).rejects.toThrow(CreditLimitError);
    await expect(ledger.charge(searchCharge("bob"))).resolves.toMatchObject({ userId: "bob" });
  });

  it("refunds append a reversing entry and are idempotent", async () => {
    const ledger = ledgerWith();
    const entry = await ledger.charge(searchCharge());

    await ledger.refund(entry.id);
    await ledger.refund(entry.id);

    const entries = await ledger.getEntries("alice");
    expect(entries.map((e) => e.kind)).toEqual(["charge", "refund"]);
    expect(entries[1]?.refundOf).toBe(entry.id);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0, remaining: 20 });
  });

  it("continues from existing state, so balances survive the ledger being rebuilt", async () => {
    const state = createLedgerState();
    await ledgerWith({ state }).charge(searchCharge());

    // Same data, new logic with a new price (what a dev hot reload does).
    const rebuilt = ledgerWith({ state, costs: { ...FLAT, search: 5 } });
    await rebuilt.charge(searchCharge());

    expect(await rebuilt.getUsage("alice")).toMatchObject({ used: 6 });
    expect((await rebuilt.getEntries("alice")).map((e) => e.amount)).toEqual([1, 5]);
  });

  it("rejects invalid limits", () => {
    expect(() => new InMemoryCreditLedger({ limit: -1 })).toThrow(RangeError);
    expect(() => new InMemoryCreditLedger({ limit: 1.5 })).toThrow(RangeError);
  });

  it("rejects a price that isn't a positive integer", () => {
    for (const bad of [0, -2, 1.5]) {
      expect(() => new InMemoryCreditLedger({ costs: { ...PRICED, comments: bad } })).toThrow(
        /comments/,
      );
    }
  });

  describe("per-action prices", () => {
    it("charges each action its own price", async () => {
      const ledger = ledgerWith({ costs: PRICED });

      for (const action of ["search", "videoDetails", "comments", "transcript"] as const) {
        await ledger.charge(charge(action));
      }

      const entries = await ledger.getEntries("alice");
      expect(entries.map((e) => [e.action, e.amount])).toEqual([
        ["search", 3],
        ["videoDetails", 1],
        ["comments", 2],
        ["transcript", 2],
      ]);
      expect(await ledger.getUsage("alice")).toMatchObject({ used: 8, remaining: 12 });
    });

    it("blocks a 3-credit search when only 2 credits are left, without recording anything", async () => {
      const ledger = ledgerWith({ limit: 5, costs: PRICED });
      await ledger.charge(searchCharge()); // 3 used, 2 left

      const attempt = ledger.charge(searchCharge("alice", "another"));

      await expect(attempt).rejects.toBeInstanceOf(CreditLimitError);
      await expect(attempt).rejects.toMatchObject({
        usage: { used: 3, limit: 5, remaining: 2 },
        attempted: { action: "search", cost: 3 },
      });
      expect(await ledger.getEntries("alice")).toHaveLength(1);
    });

    it("still allows a cheaper action with the same 2 credits left", async () => {
      const ledger = ledgerWith({ limit: 5, costs: PRICED });
      await ledger.charge(searchCharge()); // 3 used, 2 left

      await expect(ledger.charge(charge("comments"))).resolves.toMatchObject({ amount: 2 });
      expect(await ledger.getUsage("alice")).toMatchObject({ used: 5, remaining: 0 });
    });

    it("allows spending exactly down to zero", async () => {
      const ledger = ledgerWith({ limit: 3, costs: PRICED });

      await expect(ledger.charge(searchCharge())).resolves.toMatchObject({ amount: 3 });
      expect(await ledger.getUsage("alice")).toMatchObject({ remaining: 0 });
    });

    it("can't be overspent by concurrent charges of different prices", async () => {
      const ledger = ledgerWith({ limit: 10, costs: PRICED });

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => ledger.charge(searchCharge("alice", `k${i}`))),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3); // 3 x 3 = 9
      expect(await ledger.getUsage("alice")).toMatchObject({ used: 9, remaining: 1 });
    });

    it("refunds exactly what was charged", async () => {
      const ledger = ledgerWith({ costs: PRICED });
      const entry = await ledger.charge(searchCharge());

      await ledger.refund(entry.id);

      expect(await ledger.getUsage("alice")).toMatchObject({ used: 0, remaining: 20 });
    });
  });
});

describe("withCredit", () => {
  it("charges the action's price for a successful call and reports it", async () => {
    const ledger = ledgerWith({ costs: PRICED });

    const result = await withCredit(ledger, searchCharge(), async () => "data");

    expect(result).toEqual({ value: "data", charged: 3 });
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 3 });
  });

  it("blocks a limit-reached request before the upstream call is made", async () => {
    const ledger = ledgerWith({ limit: 0 });
    const upstream = vi.fn(async () => "data");

    await expect(withCredit(ledger, searchCharge(), upstream)).rejects.toThrow(CreditLimitError);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refunds an answer that isn't billable, and reports 0 charged", async () => {
    const ledger = ledgerWith({ costs: PRICED });

    const result = await withCredit(
      ledger,
      charge("transcript"),
      async () => ({ available: false }),
      { billable: (value) => value.available },
    );

    expect(result).toEqual({ value: { available: false }, charged: 0 });
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0 });
    expect((await ledger.getEntries("alice")).map((e) => e.kind)).toEqual(["charge", "refund"]);
  });

  it("refunds the full price when the upstream call fails (failures are free)", async () => {
    const ledger = ledgerWith({ costs: PRICED });

    await expect(
      withCredit(ledger, searchCharge(), async () => {
        throw new Error("upstream failed");
      }),
    ).rejects.toThrow("upstream failed");

    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0 });
  });
});
