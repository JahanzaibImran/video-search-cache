import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiErrorResponse, SearchResponse } from "@/lib/api/types";
import { CREDITS_PER_CALL } from "@/lib/credits";
import { youtubeErrorBody } from "@/test/fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { apiRequest, setupApp } from "@/test/routes";
import { GET } from "./route";

const search = (q: string, userId = "alice") =>
  GET(apiRequest(`/api/search?q=${encodeURIComponent(q)}`, { userId }));

describe("GET /api/search", () => {
  beforeEach(() => setupApp());

  it("returns results with fresh cache meta and charges one credit (happy path)", async () => {
    const response = await search("React Hooks");
    const body = (await response.json()) as SearchResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ id: "vid00000001", channelTitle: "Channel 1" });
    expect(body.meta).toMatchObject({
      cacheKey: "yt:search:react hooks",
      source: "upstream",
      cached: false,
    });
    expect(body.credits).toEqual({ used: 1, limit: 20, remaining: 19 });
  });

  it("serves a repeat (normalised) query from cache without charging", async () => {
    await search("React Hooks");
    const body = (await (await search("  react   hooks ")).json()) as SearchResponse;

    expect(body.meta).toMatchObject({ source: "cache", cached: true });
    expect(body.credits.used).toBe(1);
    expect(youtubeCalls.search).toBe(1);
  });

  it("returns 402 when the credit limit is reached, without calling YouTube", async () => {
    setupApp({ CREDIT_LIMIT: "1" });
    await search("first query");
    expect(youtubeCalls.search).toBe(1);

    const response = await search("second query");
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("CREDIT_LIMIT_REACHED");
    expect(body.credits).toEqual({ used: 1, limit: 1, remaining: 0 });
    expect(youtubeCalls.search).toBe(1); // the blocked request never reached upstream
  });

  it("reports what each request was charged: the price on a miss, 0 on a hit", async () => {
    const miss = (await (await search("cost check")).json()) as SearchResponse;
    const hit = (await (await search("cost check")).json()) as SearchResponse;

    expect(miss.meta.creditsCharged).toBe(CREDITS_PER_CALL);
    expect(hit.meta.creditsCharged).toBe(0);
    expect(hit.credits.used).toBe(CREDITS_PER_CALL);
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

      expect(((await response.json()) as SearchResponse).credits.used).toBe(2);
      expect(response.cookies.get("vsc_uid")).toBeUndefined();
    });
  });
});
