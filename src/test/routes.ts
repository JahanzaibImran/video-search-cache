import { NextRequest } from "next/server";
import { vi } from "vitest";
import { resetContainer } from "@/lib/container";
import { SC_TEST_API_KEY } from "./msw/scrapecreators-handlers";

interface TestEnv {
  VIDEO_PROVIDER?: "youtube" | "scrapecreators";
  YOUTUBE_API_KEY?: string;
  SCRAPECREATORS_API_KEY?: string;
  CREDIT_LIMIT?: string;
}

/**
 * Fresh app state (cold cache, empty ledger) with the given env. Keys are
 * always fake test values: MSW checks them, and no real key can leak in.
 */
export function setupApp(env: TestEnv = {}) {
  vi.stubEnv("VIDEO_PROVIDER", env.VIDEO_PROVIDER ?? "youtube");
  vi.stubEnv("YOUTUBE_API_KEY", env.YOUTUBE_API_KEY ?? "test-key");
  vi.stubEnv("SCRAPECREATORS_API_KEY", env.SCRAPECREATORS_API_KEY ?? SC_TEST_API_KEY);
  vi.stubEnv("CREDIT_LIMIT", env.CREDIT_LIMIT ?? "20");
  // Base URL overrides would point tests somewhere unexpected; always use the mocked defaults.
  vi.stubEnv("YOUTUBE_API_BASE_URL", "");
  vi.stubEnv("SCRAPECREATORS_API_BASE_URL", "");
  resetContainer();
}

export function apiRequest(path: string, init: { userId?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (init.userId) headers.set("x-user-id", init.userId);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}
