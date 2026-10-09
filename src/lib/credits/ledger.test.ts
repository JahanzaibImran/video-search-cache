import { describe, expect, it, vi } from "vitest";
import { CREDITS_PER_CALL } from "./costs";
import { CreditLimitError } from "./errors";
import {
  createLedgerState,
  InMemoryCreditLedger,
  withCredit,
  type InMemoryCreditLedgerOptions,
} from "./ledger";
import type { ChargeInput } from "./types";

const searchCharge = (userId = "alice", cacheKey = "yt:search:cats"): ChargeInput => ({
  userId,
  action: "search",
  cacheKey,
});

/** Most tests count calls, so they pin the price to 1 credit regardless of `costs.ts`. */
const ledgerWith = (options: InMemoryCreditLedgerOptions = {}) =>
  new InMemoryCreditLedger({ costPerCall: 1, ...options });

describe("InMemoryCreditLedger", () => {
  it("defaults to a limit of 20 with nothing used", async () => {
    const ledger = new InMemoryCreditLedger();
    expect(await ledger.getUsage("alice")).toEqual({ used: 0, limit: 20, remaining: 20 });
    expect(ledger.costPerCall).toBe(CREDITS_PER_CALL);
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
    const charge = await ledger.charge(searchCharge());

    await ledger.refund(charge.id);
    await ledger.refund(charge.id);

    const entries = await ledger.getEntries("alice");
    expect(entries.map((e) => e.kind)).toEqual(["charge", "refund"]);
    expect(entries[1]?.refundOf).toBe(charge.id);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0, remaining: 20 });
  });

  it("rejects invalid limits", () => {
    expect(() => new InMemoryCreditLedger({ limit: -1 })).toThrow(RangeError);
    expect(() => new InMemoryCreditLedger({ limit: 1.5 })).toThrow(RangeError);
  });

  describe("with a price above 1 credit per call", () => {
    it("charges the configured amount per call", async () => {
      const ledger = ledgerWith({ limit: 20, costPerCall: 10 });

      const charge = await ledger.charge(searchCharge());

      expect(charge.amount).toBe(10);
      expect(await ledger.getUsage("alice")).toEqual({ used: 10, limit: 20, remaining: 10 });
    });

    it("refuses a call the user can't fully afford instead of overspending", async () => {
      const ledger = ledgerWith({ limit: 15, costPerCall: 10 });
      await ledger.charge(searchCharge());

      await expect(ledger.charge(searchCharge())).rejects.toMatchObject({
        usage: { used: 10, limit: 15, remaining: 5 },
      });
      expect(await ledger.getEntries("alice")).toHaveLength(1);
    });

    it("refunds exactly what was charged", async () => {
      const ledger = ledgerWith({ limit: 20, costPerCall: 10 });
      const charge = await ledger.charge(searchCharge());

      await ledger.refund(charge.id);

      expect(await ledger.getUsage("alice")).toMatchObject({ used: 0, remaining: 20 });
    });

    it("can't be overspent by concurrent charges", async () => {
      const ledger = ledgerWith({ limit: 25, costPerCall: 10 });

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) => ledger.charge(searchCharge("alice", `k${i}`))),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(await ledger.getUsage("alice")).toMatchObject({ used: 20, remaining: 5 });
    });
  });

  it("continues from existing state, so balances survive the ledger being rebuilt", async () => {
    const state = createLedgerState();
    await ledgerWith({ state, costPerCall: 1 }).charge(searchCharge());

    // Same data, new logic with a new price (what a dev hot reload does).
    const rebuilt = ledgerWith({ state, costPerCall: 5 });
    await rebuilt.charge(searchCharge());

    expect(await rebuilt.getUsage("alice")).toMatchObject({ used: 6 });
    expect((await rebuilt.getEntries("alice")).map((e) => e.amount)).toEqual([1, 5]);
  });

  it("rejects a price that isn't a positive integer", () => {
    expect(() => new InMemoryCreditLedger({ costPerCall: 0 })).toThrow(RangeError);
    expect(() => new InMemoryCreditLedger({ costPerCall: -2 })).toThrow(RangeError);
    expect(() => new InMemoryCreditLedger({ costPerCall: 1.5 })).toThrow(RangeError);
  });
});

describe("withCredit", () => {
  it("charges one call's credits for a successful call", async () => {
    const ledger = ledgerWith();

    const result = await withCredit(ledger, searchCharge(), async () => "data");

    expect(result).toEqual({ value: "data", charged: 1 });
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 1 });
  });

  it("blocks a limit-reached request before the upstream call is made", async () => {
    const ledger = ledgerWith({ limit: 0 });
    const upstream = vi.fn(async () => "data");

    await expect(withCredit(ledger, searchCharge(), upstream)).rejects.toThrow(CreditLimitError);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refunds the credit when the upstream call fails", async () => {
    const ledger = ledgerWith();

    await expect(
      withCredit(ledger, searchCharge(), async () => {
        throw new Error("upstream failed");
      }),
    ).rejects.toThrow("upstream failed");

    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0 });
  });
});
