import { describe, expect, it } from "vitest";
import { UpstreamError } from "@/lib/providers/errors";
import { createScrapeCreatorsClient } from "@/lib/providers/scrapecreators/client";
import { takeBlockedRequests } from "./network-guard";

/**
 * Tests for the guard itself. Each test takes the blocked list before it ends,
 * otherwise setup.ts would (correctly) fail it for touching the network.
 */
describe("network guard", () => {
  it("blocks an unmocked request and records it without the query string", async () => {
    await expect(fetch("https://api.example.com/v1/thing?key=SECRET")).rejects.toThrow();

    expect(takeBlockedRequests()).toEqual(["GET https://api.example.com/v1/thing"]);
  });

  it("catches the case MSW alone would let pass: a client that turns the failure into an UpstreamError", async () => {
    // Points at a host with no MSW handler, as if a test forgot to mock it.
    const client = createScrapeCreatorsClient({ apiKey: "k", baseUrl: "https://real-api.example" });

    // On its own this looks like a normal, passing "provider error" test...
    await expect(client.search("youtube", "cats")).rejects.toBeInstanceOf(UpstreamError);

    // ...but the guard saw the real network call, so setup.ts would fail this test.
    expect(takeBlockedRequests()).toEqual(["GET https://real-api.example/v1/youtube/search"]);
  });

  it("has no real API keys in the environment", () => {
    expect(process.env.YOUTUBE_API_KEY ?? "").toBe("");
    expect(process.env.SCRAPECREATORS_API_KEY ?? "").toBe("");
  });
});
