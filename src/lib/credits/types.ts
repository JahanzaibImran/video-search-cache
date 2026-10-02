/** The kind of upstream call a credit was spent on. One credit = one upstream API call. */
export type CreditAction = "search" | "video" | "comments";

export interface LedgerEntry {
  id: string;
  userId: string;
  action: CreditAction;
  cacheKey: string;
  /** Epoch ms. */
  timestamp: number;
  /** `refund` entries reverse an earlier charge whose upstream call failed. */
  kind: "charge" | "refund";
  /** For refunds: the id of the charge being reversed. */
  refundOf?: string;
}

export interface CreditUsage {
  used: number;
  limit: number;
  remaining: number;
}

export interface ChargeInput {
  userId: string;
  action: CreditAction;
  cacheKey: string;
}

/**
 * Per-user credit ledger. Async so a Postgres/Redis implementation can be
 * dropped in. `charge` must be atomic (check + record) in any implementation;
 * in SQL that's a transaction or a conditional INSERT.
 */
export interface CreditLedger {
  getUsage(userId: string): Promise<CreditUsage>;
  /** Records one credit spent, or throws `CreditLimitError` if the user has none left. */
  charge(input: ChargeInput): Promise<LedgerEntry>;
  /** Reverses a charge (idempotent). Used when the upstream call it paid for fails. */
  refund(chargeId: string): Promise<void>;
  getEntries(userId: string): Promise<LedgerEntry[]>;
}
