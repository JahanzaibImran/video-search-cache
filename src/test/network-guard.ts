import type { UnhandledRequestCallback } from "msw";

/**
 * Makes "a test tried to reach the real network" impossible to miss.
 *
 * MSW's plain `onUnhandledRequest: "error"` blocks the request by making
 * `fetch` reject, but our clients turn fetch failures into a friendly
 * UpstreamError. A test that expects an error could then pass while it was
 * really trying to call the live API. So unmocked requests are:
 *   1. always blocked (`print.error()`: without it MSW would let them through), and
 *   2. recorded, so `setup.ts` fails the test that made them in `afterEach`.
 */
const blocked: string[] = [];

export const onUnhandledRequest: UnhandledRequestCallback = (request, print) => {
  const url = new URL(request.url);
  // Never record query strings: they can carry API keys (the YouTube client sends `key=`).
  blocked.push(`${request.method} ${url.origin}${url.pathname}`);
  print.error();
};

/** Returns and clears the requests blocked since the last call. */
export function takeBlockedRequests(): string[] {
  return blocked.splice(0, blocked.length);
}
