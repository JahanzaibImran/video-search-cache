/**
 * The single source of truth for what an upstream call costs.
 *
 * The ledger charges from it, the API reports what was charged, and the UI
 * explains prices from it. It must stay free of server-only imports (no
 * `node:*`, no env) so client components can import it directly.
 */
export const CREDITS_PER_CALL = 1;
