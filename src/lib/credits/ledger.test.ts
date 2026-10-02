import { describe, expect, it, vi } from "vitest";
import { CreditLimitError } from "./errors";
import { InMemoryCreditLedger, withCredit } from "./ledger";
import type { ChargeInput } from "./types";

const searchCharge = (userId = "alice", cacheKey = "yt:search:cats"): ChargeInput => ({
  userId,
  action: "search",
  cacheKey,
});

describe("InMemoryCreditLedger", () => {
  it("defaults to a limit of 20 with nothing used", async () => {
    const ledger = new InMemoryCreditLedger();
    expect(await ledger.getUsage("alice")).toEqual({ used: 0, limit: 20, remaining: 20 });
  });

  it("records userId, action, cache key and timestamp on each charge", async () => {
    const ledger = new InMemoryCreditLedger({ now: () => 1234 });

    await ledger.charge({ userId: "alice", action: "comments", cacheKey: "yt:comments:abc" });

    expect(await ledger.getEntries("alice")).toEqual([
      expect.objectContaining({
        userId: "alice",
        action: "comments",
        cacheKey: "yt:comments:abc",
        timestamp: 1234,
        kind: "charge",
      }),
    ]);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 1, remaining: 19 });
  });

  it("throws CreditLimitError once the limit is reached", async () => {
    const ledger = new InMemoryCreditLedger({ limit: 2 });
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
    const ledger = new InMemoryCreditLedger({ limit: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => ledger.charge(searchCharge("alice", `k${i}`))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 3, remaining: 0 });
  });

  it("tracks each user's credits independently", async () => {
    const ledger = new InMemoryCreditLedger({ limit: 1 });
    await ledger.charge(searchCharge("alice"));

    await expect(ledger.charge(searchCharge("alice"))).rejects.toThrow(CreditLimitError);
    await expect(ledger.charge(searchCharge("bob"))).resolves.toMatchObject({ userId: "bob" });
  });

  it("refunds append a reversing entry and are idempotent", async () => {
    const ledger = new InMemoryCreditLedger();
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
});

describe("withCredit", () => {
  it("charges one credit for a successful call", async () => {
    const ledger = new InMemoryCreditLedger();

    const result = await withCredit(ledger, searchCharge(), async () => "data");

    expect(result).toBe("data");
    expect(await ledger.getUsage("alice")).toMatchObject({ used: 1 });
  });

  it("blocks a limit-reached request before the upstream call is made", async () => {
    const ledger = new InMemoryCreditLedger({ limit: 0 });
    const upstream = vi.fn(async () => "data");

    await expect(withCredit(ledger, searchCharge(), upstream)).rejects.toThrow(CreditLimitError);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refunds the credit when the upstream call fails", async () => {
    const ledger = new InMemoryCreditLedger();

    await expect(
      withCredit(ledger, searchCharge(), async () => {
        throw new Error("upstream failed");
      }),
    ).rejects.toThrow("upstream failed");

    expect(await ledger.getUsage("alice")).toMatchObject({ used: 0 });
  });
});
