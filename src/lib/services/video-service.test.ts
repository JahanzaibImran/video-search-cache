import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createCachedFetch, InMemoryCacheStore } from "@/lib/cache";
import { CreditLimitError, InMemoryCreditLedger } from "@/lib/credits";
import { createYouTubeClient, NotFoundError, UpstreamError } from "@/lib/youtube";
import { MISSING_VIDEO_ID, VIDEO_ID } from "@/test/fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { createVideoService, type VideoService } from "./video-service";

const LIMIT = 5;

describe("VideoService (cache + credits + YouTube client)", () => {
  let ledger: InMemoryCreditLedger;
  let service: VideoService;

  beforeEach(() => {
    ledger = new InMemoryCreditLedger({ limit: LIMIT, costPerCall: 1 });
    service = createVideoService({
      youtube: createYouTubeClient({ apiKey: "test-key" }),
      ledger,
      cache: createCachedFetch(new InMemoryCacheStore()),
    });
  });

  async function exhaustCredits(userId: string) {
    for (let i = 0; i < LIMIT; i++) {
      await ledger.charge({ userId, action: "search", cacheKey: `seed:${i}` });
    }
  }

  describe("credits", () => {
    it("deducts one credit on a cache miss", async () => {
      const result = await service.search("alice", "react hooks");

      expect(result.source).toBe("upstream");
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("alice")).toMatchObject({ used: 1, remaining: LIMIT - 1 });
      expect(await ledger.getEntries("alice")).toEqual([
        expect.objectContaining({ action: "search", cacheKey: "yt:search:react hooks" }),
      ]);
    });

    it("does NOT deduct on a cache hit, even for an equivalent query", async () => {
      await service.search("alice", "React Hooks");
      const hit = await service.search("alice", "  react   hooks ");

      expect(hit.source).toBe("cache");
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("alice")).toMatchObject({ used: 1 });
    });

    it("shares the cache across users: a second user's hit is free", async () => {
      await service.search("alice", "react hooks");
      const hit = await service.search("bob", "react hooks");

      expect(hit.source).toBe("cache");
      expect(await service.getUsage("bob")).toMatchObject({ used: 0 });
    });

    it("blocks a limit-reached miss before any API call", async () => {
      await exhaustCredits("alice");

      await expect(service.search("alice", "react hooks")).rejects.toBeInstanceOf(CreditLimitError);
      expect(youtubeCalls.total).toBe(0);
    });

    it("still serves cache hits to a user who is out of credits", async () => {
      await service.search("bob", "react hooks"); // warm the cache
      await exhaustCredits("alice");

      const result = await service.search("alice", "react hooks");

      expect(result.source).toBe("cache");
      expect(youtubeCalls.search).toBe(1);
    });

    it("refunds the credit and caches nothing when the upstream call fails", async () => {
      server.use(
        http.get(youtubeUrl("search"), () => new HttpResponse(null, { status: 500 }), {
          once: true,
        }),
      );

      await expect(service.search("alice", "react hooks")).rejects.toBeInstanceOf(UpstreamError);
      expect(await service.getUsage("alice")).toMatchObject({ used: 0 });

      const retry = await service.search("alice", "react hooks");
      expect(retry.source).toBe("upstream");
      expect(await service.getUsage("alice")).toMatchObject({ used: 1 });
    });
  });

  describe("in-flight dedupe", () => {
    it("charges once and calls upstream once for concurrent identical searches", async () => {
      const results = await Promise.all([
        service.search("alice", "react hooks"),
        service.search("alice", "React Hooks"),
        service.search("bob", "react   hooks"),
      ]);

      expect(youtubeCalls.search).toBe(1);
      expect(results.filter((r) => r.source === "upstream")).toHaveLength(1);
      const totalUsed =
        (await service.getUsage("alice")).used + (await service.getUsage("bob")).used;
      expect(totalUsed).toBe(1);
    });

    it("doesn't fail a user who joined a fetch led by someone with no credits", async () => {
      await exhaustCredits("alice");

      const [alice, bob] = await Promise.allSettled([
        service.search("alice", "react hooks"),
        service.search("bob", "react hooks"),
      ]);

      expect(alice).toMatchObject({ status: "rejected", reason: expect.any(CreditLimitError) });
      expect(bob).toMatchObject({ status: "fulfilled", value: { source: "upstream" } });
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("bob")).toMatchObject({ used: 1 });
    });
  });

  describe("getVideoWithComments", () => {
    it("fetches video + comments (2 credits) the first time and nothing the second", async () => {
      const first = await service.getVideoWithComments("alice", VIDEO_ID);
      expect(first.video).toMatchObject({ source: "upstream", key: `yt:video:${VIDEO_ID}` });
      expect(first.comments).toMatchObject({ source: "upstream", key: `yt:comments:${VIDEO_ID}` });
      expect(first.comments.value.comments).toHaveLength(2);

      const second = await service.getVideoWithComments("alice", VIDEO_ID);
      expect(second.video.source).toBe("cache");
      expect(second.comments.source).toBe("cache");

      expect(youtubeCalls.total).toBe(2);
      expect(await service.getUsage("alice")).toMatchObject({ used: 2 });
    });

    it("stops before fetching comments when the video doesn't exist, and refunds", async () => {
      await expect(service.getVideoWithComments("alice", MISSING_VIDEO_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      );

      expect(youtubeCalls.videos).toBe(1);
      expect(youtubeCalls.commentThreads).toBe(0);
      expect(await service.getUsage("alice")).toMatchObject({ used: 0 });
    });
  });
});
