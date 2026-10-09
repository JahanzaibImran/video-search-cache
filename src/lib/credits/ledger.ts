import { randomUUID } from "node:crypto";
import { CREDIT_COSTS, creditCost, type CreditCosts } from "./costs";
import { CreditLimitError } from "./errors";
import type { ChargeInput, CreditLedger, CreditUsage, LedgerEntry } from "./types";

export const DEFAULT_CREDIT_LIMIT = 20;

/**
 * The ledger's data, kept separate from its logic. In dev the container keeps
 * this object across hot reloads, so balances survive a code edit while the
 * pricing logic always comes from the current code.
 */
export interface LedgerState {
  entriesByUser: Map<string, LedgerEntry[]>;
  chargesById: Map<string, LedgerEntry>;
  refunded: Set<string>;
}

export function createLedgerState(): LedgerState {
  return { entriesByUser: new Map(), chargesById: new Map(), refunded: new Set() };
}

export interface InMemoryCreditLedgerOptions {
  limit?: number;
  /** Override for tests. The app always uses `CREDIT_COSTS` from `costs.ts`. */
  costs?: CreditCosts;
  /** Existing data to continue from (see `LedgerState`). */
  state?: LedgerState;
  now?: () => number;
}

/**
 * Append-only, process-local ledger. Balances are derived from entries rather
 * than stored, so the history is always auditable. A persistent version would
 * be a `ledger_entries` table with an index on `user_id`.
 */
export class InMemoryCreditLedger implements CreditLedger {
  private readonly state: LedgerState;
  readonly limit: number;
  readonly costs: CreditCosts;
  private readonly now: () => number;

  constructor(options: InMemoryCreditLedgerOptions = {}) {
    const limit = options.limit ?? DEFAULT_CREDIT_LIMIT;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(`Credit limit must be a non-negative integer, got ${limit}`);
    }
    const costs = options.costs ?? CREDIT_COSTS;
    for (const [action, cost] of Object.entries(costs)) {
      if (!Number.isInteger(cost) || cost < 1) {
        throw new RangeError(`Cost of "${action}" must be a positive integer, got ${cost}`);
      }
    }
    this.limit = limit;
    this.costs = costs;
    this.state = options.state ?? createLedgerState();
    this.now = options.now ?? Date.now;
  }

  async getUsage(userId: string): Promise<CreditUsage> {
    return this.usageFor(userId);
  }

  async charge({ userId, action, cacheKey }: ChargeInput): Promise<LedgerEntry> {
    // Check and append happen synchronously, so concurrent charges can't overspend.
    // The check uses this action's real price: 2 credits left can't buy a 3-credit search.
    const cost = creditCost(action, this.costs);
    const usage = this.usageFor(userId);
    if (usage.remaining < cost) throw new CreditLimitError(userId, usage, { action, cost });

    const entry: LedgerEntry = {
      id: randomUUID(),
      userId,
      action,
      cacheKey,
      timestamp: this.now(),
      amount: cost,
      kind: "charge",
    };
    this.append(entry);
    this.state.chargesById.set(entry.id, entry);
    return entry;
  }

  async refund(chargeId: string): Promise<void> {
    const charge = this.state.chargesById.get(chargeId);
    if (!charge || this.state.refunded.has(chargeId)) return;

    this.state.refunded.add(chargeId);
    this.append({
      ...charge,
      id: randomUUID(),
      timestamp: this.now(),
      kind: "refund",
      refundOf: chargeId,
    });
  }

  async getEntries(userId: string): Promise<LedgerEntry[]> {
    return [...(this.state.entriesByUser.get(userId) ?? [])];
  }

  private usageFor(userId: string): CreditUsage {
    let used = 0;
    for (const entry of this.state.entriesByUser.get(userId) ?? []) {
      used += entry.kind === "charge" ? entry.amount : -entry.amount;
    }
    return { used, limit: this.limit, remaining: Math.max(0, this.limit - used) };
  }

  private append(entry: LedgerEntry): void {
    const list = this.state.entriesByUser.get(entry.userId);
    if (list) list.push(entry);
    else this.state.entriesByUser.set(entry.userId, [entry]);
  }
}

export interface WithCreditOptions<T> {
  /**
   * Whether a successful answer is worth paying for. Returning false refunds
   * the charge, e.g. "this video has no transcript": the call worked, but the
   * user got nothing they can use, so it's free.
   */
  billable?: (value: T) => boolean;
}

/**
 * Charges for one call, runs the upstream call, and refunds the charge if the
 * call fails (or its answer isn't billable). If the user can't afford it,
 * `call` is never invoked. Returns how much was actually charged, so callers
 * report the real cost instead of assuming it.
 *
 * The charge happens *before* the call on purpose: it reserves the credits
 * atomically, so two parallel requests can't both spend the last credit.
 */
export async function withCredit<T>(
  ledger: CreditLedger,
  input: ChargeInput,
  call: () => Promise<T>,
  { billable }: WithCreditOptions<T> = {},
): Promise<{ value: T; charged: number }> {
  const charge = await ledger.charge(input);
  let value: T;
  try {
    value = await call();
  } catch (error) {
    await ledger.refund(charge.id);
    throw error;
  }
  if (billable && !billable(value)) {
    await ledger.refund(charge.id);
    return { value, charged: 0 };
  }
  return { value, charged: charge.amount };
}
