import { afterAll, afterEach, beforeAll } from "vitest";
import { youtubeCalls } from "./msw/handlers";
import { scCalls } from "./msw/scrapecreators-handlers";
import { server } from "./msw/server";
import { onUnhandledRequest, takeBlockedRequests } from "./network-guard";

// Real keys must never reach a test, even if a developer has them exported in
// their shell. Tests that need a key set a fake one (see src/test/routes.ts).
for (const name of ["YOUTUBE_API_KEY", "SCRAPECREATORS_API_KEY"]) {
  process.env[name] = "";
}

// Every request needs a mock. Anything else is blocked and fails the test (see network-guard.ts).
beforeAll(() => server.listen({ onUnhandledRequest }));
afterEach(() => {
  server.resetHandlers();
  youtubeCalls.reset();
  scCalls.reset();

  const blocked = takeBlockedRequests();
  if (blocked.length > 0) {
    throw new Error(
      `This test tried to reach the real network (blocked):\n  ${blocked.join("\n  ")}\n` +
        "Add an MSW handler (src/test/msw) or inject a fake.",
    );
  }
});
afterAll(() => server.close());
