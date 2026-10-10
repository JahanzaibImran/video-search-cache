/**
 * The single source of truth for what each upstream call costs.
 *
 * The ledger charges from it, the API reports what was charged, and the UI
 * explains prices from it. Changing a number here changes all three. It must
 * stay free of server-only imports (no `node:*`, no env) so client components
 * can import it directly.
 *
 * Only real upstream calls are charged. Cache hits, failed calls and
 * "nothing to return" answers (e.g. comments turned off) cost nothing.
 */
export const CREDIT_COSTS = {
  /** Searches are the most expensive call upstream, so they cost the most. */
  search: 3,
  videoDetails: 1,
  comments: 2,
  transcript: 2,
} as const satisfies Record<string, number>;

/** The kinds of upstream call that cost credits. Derived from the table, so they can't drift apart. */
export type CreditAction = keyof typeof CREDIT_COSTS;

export type CreditCosts = Record<CreditAction, number>;

/** Human names for messages and the price list, e.g. "A search costs 3 credits". */
export const ACTION_LABELS: Record<CreditAction, string> = {
  search: "A search",
  videoDetails: "Loading video details",
  comments: "Loading comments",
  transcript: "A transcript",
};

export function creditCost(action: CreditAction, costs: CreditCosts = CREDIT_COSTS): number {
  return costs[action];
}
