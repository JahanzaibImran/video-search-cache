import { randomUUID } from "node:crypto";
import { CreditLimitError } from "./errors";
import type { ChargeInput, CreditLedger, CreditUsage, LedgerEntry } from "./types";

export const DEFAULT_CREDIT_LIMIT = 20;

export interface InMemoryCreditLedgerOptions {
  limit?: number;
  now?: () => number;
}

/**
 * Append-only, process-local ledger. Balances are derived from entries rather
 * than stored, so the history is always auditable. A persistent version would
 * be a `ledger_entries` table with an index on `user_id`.
 */
export class InMemoryCreditLedger implements CreditLedger {
  private readonly entriesByUser = new Map<string, LedgerEntry[]>();
  private readonly chargesById = new Map<string, LedgerEntry>();
  private readonly refunded = new Set<string>();
  readonly limit: number;
  private readonly now: () => number;

  constructor(options: InMemoryCreditLedgerOptions = {}) {
    const limit = options.limit ?? DEFAULT_CREDIT_LIMIT;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(`Credit limit must be a non-negative integer, got ${limit}`);
    }
    this.limit = limit;
    this.now = options.now ?? Date.now;
  }

  async getUsage(userId: string): Promise<CreditUsage> {
    return this.usageFor(userId);
  }

  async charge({ userId, action, cacheKey }: ChargeInput): Promise<LedgerEntry> {
    // Check and append happen synchronously, so concurrent charges can't overspend.
    const usage = this.usageFor(userId);
    if (usage.remaining <= 0) throw new CreditLimitError(userId, usage);

    const entry: LedgerEntry = {
      id: randomUUID(),
      userId,
      action,
      cacheKey,
      timestamp: this.now(),
      kind: "charge",
    };
    this.append(entry);
    this.chargesById.set(entry.id, entry);
    return entry;
  }

  async refund(chargeId: string): Promise<void> {
    const charge = this.chargesById.get(chargeId);
    if (!charge || this.refunded.has(chargeId)) return;

    this.refunded.add(chargeId);
    this.append({
      ...charge,
      id: randomUUID(),
      timestamp: this.now(),
      kind: "refund",
      refundOf: chargeId,
    });
  }

  async getEntries(userId: string): Promise<LedgerEntry[]> {
    return [...(this.entriesByUser.get(userId) ?? [])];
  }

  private usageFor(userId: string): CreditUsage {
    let used = 0;
    for (const entry of this.entriesByUser.get(userId) ?? []) {
      used += entry.kind === "charge" ? 1 : -1;
    }
    return { used, limit: this.limit, remaining: Math.max(0, this.limit - used) };
  }

  private append(entry: LedgerEntry): void {
    const list = this.entriesByUser.get(entry.userId);
    if (list) list.push(entry);
    else this.entriesByUser.set(entry.userId, [entry]);
  }
}

/**
 * Charges one credit, runs the upstream call, and refunds the credit if the
 * call fails. If the user is out of credits, `call` is never invoked.
 */
export async function withCredit<T>(
  ledger: CreditLedger,
  input: ChargeInput,
  call: () => Promise<T>,
): Promise<T> {
  const charge = await ledger.charge(input);
  try {
    return await call();
  } catch (error) {
    await ledger.refund(charge.id);
    throw error;
  }
}
