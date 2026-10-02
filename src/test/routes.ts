import { NextRequest } from "next/server";
import { vi } from "vitest";
import { resetContainer } from "@/lib/container";

/** Fresh app state (cold cache, empty ledger) with the given env. */
export function setupApp(env: { YOUTUBE_API_KEY?: string; CREDIT_LIMIT?: string } = {}) {
  vi.stubEnv("YOUTUBE_API_KEY", env.YOUTUBE_API_KEY ?? "test-key");
  vi.stubEnv("CREDIT_LIMIT", env.CREDIT_LIMIT ?? "20");
  resetContainer();
}

export function apiRequest(path: string, init: { userId?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (init.userId) headers.set("x-user-id", init.userId);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}
