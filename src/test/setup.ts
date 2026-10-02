import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// Any request without a matching handler fails the test: no test ever reaches the real API.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
