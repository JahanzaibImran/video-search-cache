import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiErrorResponse, SearchResponse } from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits";
import { formatCredits } from "@/lib/format";
import { youtubeErrorBody } from "@/test/fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { scCalls } from "@/test/msw/scrapecreators-handlers";
import { apiRequest, setupApp } from "@/test/routes";
import { GET } from "./route";

const search = (q: string, userId = "alice") =>
  GET(apiRequest(`/api/search?q=${encodeURIComponent(q)}`, { userId }));

describe("GET /api/search", () => {
  beforeEach(() => setupApp());

  it("returns results with fresh cache meta and charges the search price (happy path)", async () => {
    const response = await search("React Hooks");
    const body = (await response.json()) as SearchResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ id: "vid00000001", channelTitle: "Channel 1" });
    expect(body.meta).toMatchObject({
      cacheKey: "youtube:search:react hooks",
      source: "upstream",
      cached: false,
      creditsCharged: CREDIT_COSTS.search,
    });
    expect(body.credits).toEqual({
      used: CREDIT_COSTS.search,
      limit: 20,
      remaining: 20 - CREDIT_COSTS.search,
    });
  });

  it("serves a repeat (normalised) query from cache without charging", async () => {
    await search("React Hooks");
    const body = (await (await search("  react   hooks ")).json()) as SearchResponse;

    expect(body.meta).toMatchObject({ source: "cache", cached: true, creditsCharged: 0 });
    expect(body.credits.used).toBe(CREDIT_COSTS.search);
    expect(youtubeCalls.search).toBe(1);
  });

  it("returns 402 when the user can't afford another search, without calling YouTube", async () => {
    // Enough for one search, one credit short of a second.
    setupApp({ CREDIT_LIMIT: String(2 * CREDIT_COSTS.search - 1) });
    await search("first query");
    expect(youtubeCalls.search).toBe(1);

    const response = await search("second query");
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("CREDIT_LIMIT_REACHED");
    expect(body.error.message).toContain(
      `A search costs ${formatCredits(CREDIT_COSTS.search)} and you have ${CREDIT_COSTS.search - 1} left`,
    );
    expect(body.credits).toMatchObject({ used: CREDIT_COSTS.search });
    expect(youtubeCalls.search).toBe(1); // the blocked request never reached upstream
  });

  it("reports what each request was charged: the price on a miss, 0 on a hit", async () => {
    const miss = (await (await search("cost check")).json()) as SearchResponse;
    const hit = (await (await search("cost check")).json()) as SearchResponse;

    expect(miss.meta.creditsCharged).toBe(CREDIT_COSTS.search);
    expect(hit.meta.creditsCharged).toBe(0);
    expect(hit.credits.used).toBe(CREDIT_COSTS.search);
  });

  it("maps an upstream 5xx to 502 and refunds the credit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(youtubeUrl("search"), () => new HttpResponse(null, { status: 500 })));

    const response = await search("cats");
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.credits?.used).toBe(0);
  });

  it("maps a YouTube quota error to 503 with Retry-After", async () => {
    server.use(
      http.get(youtubeUrl("search"), () =>
        HttpResponse.json(youtubeErrorBody(403, "quotaExceeded"), {
          status: 403,
          headers: { "Retry-After": "120" },
        }),
      ),
    );

    const response = await search("cats");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe("UPSTREAM_RATE_LIMITED");
  });

  it.each([
    ["an empty query", "   "],
    ["an over-long query", "x".repeat(101)],
  ])("rejects %s with 400 and doesn't charge", async (_label, q) => {
    const response = await search(q);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.credits?.used).toBe(0);
    expect(youtubeCalls.total).toBe(0);
  });

  it("rejects a malformed x-user-id header", async () => {
    const response = await search("cats", "not a valid id!");
    expect(response.status).toBe(400);
  });

  it("returns 503 NOT_CONFIGURED when YOUTUBE_API_KEY is missing", async () => {
    setupApp({ YOUTUBE_API_KEY: "" });

    const response = await search("cats");

    expect(response.status).toBe(503);
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe("NOT_CONFIGURED");
  });

  it("rejects an unknown platform with 400", async () => {
    const response = await GET(
      apiRequest("/api/search?q=cats&platform=vimeo", { userId: "alice" }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 422 for a TikTok search on the YouTube Data API provider, free", async () => {
    const response = await GET(
      apiRequest("/api/search?q=cats&platform=tiktok", { userId: "alice" }),
    );
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("UNSUPPORTED");
    expect(body.credits?.used).toBe(0);
  });

  describe("with VIDEO_PROVIDER=scrapecreators", () => {
    beforeEach(() => setupApp({ VIDEO_PROVIDER: "scrapecreators" }));

    it.each(["youtube", "tiktok"] as const)(
      "searches %s through ScrapeCreators",
      async (platform) => {
        const response = await GET(
          apiRequest(`/api/search?q=WNBA&platform=${platform}`, { userId: "alice" }),
        );
        const body = (await response.json()) as SearchResponse;

        expect(response.status).toBe(200);
        expect(body.platform).toBe(platform);
        expect(body.results.every((r) => r.platform === platform)).toBe(true);
        expect(body.meta).toMatchObject({
          cacheKey: `${platform}:search:wnba`,
          creditsCharged: CREDIT_COSTS.search,
        });
        expect(scCalls.total).toBe(1);
        expect(youtubeCalls.total).toBe(0);
      },
    );
  });

  describe("user identity", () => {
    it("issues an anonymous id cookie when the request has none", async () => {
      const response = await GET(apiRequest("/api/search?q=cats"));

      const cookie = response.cookies.get("vsc_uid");
      expect(cookie?.value).toMatch(/^[0-9a-f-]{36}$/);
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    });

    it("tracks credits per cookie id and doesn't reissue the cookie", async () => {
      await GET(apiRequest("/api/search?q=cats", { cookie: "vsc_uid=user-from-cookie" }));
      const response = await GET(
        apiRequest("/api/search?q=dogs", { cookie: "vsc_uid=user-from-cookie" }),
      );

      expect(((await response.json()) as SearchResponse).credits.used).toBe(
        2 * CREDIT_COSTS.search,
      );
      expect(response.cookies.get("vsc_uid")).toBeUndefined();
    });
  });
});
