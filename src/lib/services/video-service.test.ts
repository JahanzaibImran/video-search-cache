import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createCachedFetch, InMemoryCacheStore } from "@/lib/cache";
import { CreditLimitError, InMemoryCreditLedger, type CreditCosts } from "@/lib/credits";
import {
  createYouTubeClient,
  createYouTubeProvider,
  NotFoundError,
  UpstreamError,
} from "@/lib/youtube";
import { createScrapeCreatorsClient } from "@/lib/providers/scrapecreators/client";
import { UnsupportedError } from "@/lib/providers/errors";
import { MISSING_VIDEO_ID, VIDEO_ID } from "@/test/fixtures";
import { SC_TEST_API_KEY, scCalls } from "@/test/msw/scrapecreators-handlers";
import {
  SC_YT_NO_CAPTIONS_ID,
  SC_YT_VIDEO_ID,
  TT_NO_TRANSCRIPT_ID,
  TT_VIDEO_ID,
} from "@/test/scrapecreators-fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { createVideoService, type VideoService } from "./video-service";

const LIMIT = 5;
const yt = (id: string) => ({ platform: "youtube", id }) as const;
/** Most tests here count upstream calls, so every call costs 1. */
const FLAT: CreditCosts = { search: 1, videoDetails: 1, comments: 1, transcript: 1 };
const PRICED: CreditCosts = { search: 3, videoDetails: 1, comments: 2, transcript: 2 };

describe("VideoService (cache + credits + YouTube client)", () => {
  let ledger: InMemoryCreditLedger;
  let service: VideoService;

  function setup(costs: CreditCosts, limit = LIMIT) {
    ledger = new InMemoryCreditLedger({ limit, costs });
    service = createVideoService({
      provider: createYouTubeProvider(createYouTubeClient({ apiKey: "test-key" })),
      ledger,
      cache: createCachedFetch(new InMemoryCacheStore()),
    });
  }

  beforeEach(() => setup(FLAT));

  async function exhaustCredits(userId: string) {
    for (let i = 0; i < LIMIT; i++) {
      await ledger.charge({ userId, action: "search", cacheKey: `seed:${i}` });
    }
  }

  describe("credits", () => {
    it("deducts the price on a cache miss", async () => {
      const result = await service.search("alice", "youtube", "react hooks");

      expect(result.source).toBe("upstream");
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("alice")).toMatchObject({ used: 1, remaining: LIMIT - 1 });
      expect(await ledger.getEntries("alice")).toEqual([
        expect.objectContaining({ action: "search", cacheKey: "youtube:search:react hooks" }),
      ]);
    });

    it("does NOT deduct on a cache hit, even for an equivalent query", async () => {
      await service.search("alice", "youtube", "React Hooks");
      const hit = await service.search("alice", "youtube", "  react   hooks ");

      expect(hit.source).toBe("cache");
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("alice")).toMatchObject({ used: 1 });
    });

    it("shares the cache across users: a second user's hit is free", async () => {
      await service.search("alice", "youtube", "react hooks");
      const hit = await service.search("bob", "youtube", "react hooks");

      expect(hit.source).toBe("cache");
      expect(await service.getUsage("bob")).toMatchObject({ used: 0 });
    });

    it("blocks a limit-reached miss before any API call", async () => {
      await exhaustCredits("alice");

      await expect(service.search("alice", "youtube", "react hooks")).rejects.toBeInstanceOf(
        CreditLimitError,
      );
      expect(youtubeCalls.total).toBe(0);
    });

    it("still serves cache hits to a user who is out of credits", async () => {
      await service.search("bob", "youtube", "react hooks"); // warm the cache
      await exhaustCredits("alice");

      const result = await service.search("alice", "youtube", "react hooks");

      expect(result.source).toBe("cache");
      expect(youtubeCalls.search).toBe(1);
    });

    it("refunds the credit and caches nothing when the upstream call fails", async () => {
      server.use(
        http.get(youtubeUrl("search"), () => new HttpResponse(null, { status: 500 }), {
          once: true,
        }),
      );

      await expect(service.search("alice", "youtube", "react hooks")).rejects.toBeInstanceOf(
        UpstreamError,
      );
      expect(await service.getUsage("alice")).toMatchObject({ used: 0 });

      const retry = await service.search("alice", "youtube", "react hooks");
      expect(retry.source).toBe("upstream");
      expect(await service.getUsage("alice")).toMatchObject({ used: 1 });
    });
  });

  describe("in-flight dedupe", () => {
    it("charges once and calls upstream once for concurrent identical searches", async () => {
      const results = await Promise.all([
        service.search("alice", "youtube", "react hooks"),
        service.search("alice", "youtube", "React Hooks"),
        service.search("bob", "youtube", "react   hooks"),
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
        service.search("alice", "youtube", "react hooks"),
        service.search("bob", "youtube", "react hooks"),
      ]);

      expect(alice).toMatchObject({ status: "rejected", reason: expect.any(CreditLimitError) });
      expect(bob).toMatchObject({ status: "fulfilled", value: { source: "upstream" } });
      expect(youtubeCalls.search).toBe(1);
      expect(await service.getUsage("bob")).toMatchObject({ used: 1 });
    });
  });

  describe("getVideoWithComments", () => {
    it("fetches video + comments (2 credits) the first time and nothing the second", async () => {
      const first = await service.getVideoWithComments("alice", yt(VIDEO_ID));
      expect(first.video).toMatchObject({ source: "upstream", key: `youtube:video:${VIDEO_ID}` });
      expect(first.comments).toMatchObject({
        source: "upstream",
        key: `youtube:comments:${VIDEO_ID}`,
      });
      expect(first.comments.value.comments).toHaveLength(2);

      const second = await service.getVideoWithComments("alice", yt(VIDEO_ID));
      expect(second.video.source).toBe("cache");
      expect(second.comments.source).toBe("cache");

      expect(youtubeCalls.total).toBe(2);
      expect(await service.getUsage("alice")).toMatchObject({ used: 2 });
    });

    it("stops before fetching comments when the video doesn't exist, and refunds", async () => {
      await expect(
        service.getVideoWithComments("alice", yt(MISSING_VIDEO_ID)),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(youtubeCalls.videos).toBe(1);
      expect(youtubeCalls.commentThreads).toBe(0);
      expect(await service.getUsage("alice")).toMatchObject({ used: 0 });
    });
  });

  describe("per-action prices", () => {
    beforeEach(() => setup(PRICED, 5));

    it("charges a search its own price on a miss and reports it", async () => {
      const result = await service.search("alice", "youtube", "react hooks");

      expect(result.creditsCharged).toBe(3);
      expect(await service.getUsage("alice")).toMatchObject({ used: 3, remaining: 2 });
    });

    it("charges nothing for a cache hit and reports 0", async () => {
      await service.search("alice", "youtube", "react hooks");
      const hit = await service.search("alice", "youtube", "react hooks");

      expect(hit).toMatchObject({ source: "cache", creditsCharged: 0 });
      expect(await service.getUsage("alice")).toMatchObject({ used: 3 });
    });

    it("charges video details and comments separately: 1 + 2", async () => {
      const { video, comments } = await service.getVideoWithComments("alice", yt(VIDEO_ID));

      expect(video.creditsCharged).toBe(1);
      expect(comments.creditsCharged).toBe(2);
      expect(await service.getUsage("alice")).toMatchObject({ used: 3 });
    });

    it("charges nothing when the upstream call fails", async () => {
      server.use(http.get(youtubeUrl("search"), () => new HttpResponse(null, { status: 500 })));

      await expect(service.search("alice", "youtube", "react hooks")).rejects.toBeInstanceOf(
        UpstreamError,
      );
      expect(await service.getUsage("alice")).toMatchObject({ used: 0 });
    });

    it("blocks a 3-credit search with 2 left, before calling upstream", async () => {
      await service.search("alice", "youtube", "first"); // 3 used, 2 left

      await expect(service.search("alice", "youtube", "second")).rejects.toMatchObject({
        attempted: { action: "search", cost: 3 },
      });
      expect(youtubeCalls.search).toBe(1);
    });
  });
});

describe("VideoService with the ScrapeCreators provider", () => {
  const PRICED: CreditCosts = { search: 3, videoDetails: 1, comments: 2, transcript: 2 };
  let ledger: InMemoryCreditLedger;
  let service: VideoService;
  const tt = (id: string) => ({ platform: "tiktok", id }) as const;
  const ytRef = (id: string) => ({ platform: "youtube", id }) as const;

  beforeEach(() => {
    ledger = new InMemoryCreditLedger({ limit: 20, costs: PRICED });
    service = createVideoService({
      provider: createScrapeCreatorsClient({ apiKey: SC_TEST_API_KEY }),
      ledger,
      cache: createCachedFetch(new InMemoryCacheStore()),
    });
  });

  it("searches TikTok under a tiktok: cache key, charged once", async () => {
    const first = await service.search("alice", "tiktok", "WNBA");
    const second = await service.search("alice", "tiktok", "wnba");

    expect(first).toMatchObject({ key: "tiktok:search:wnba", creditsCharged: 3 });
    expect(second).toMatchObject({ source: "cache", creditsCharged: 0 });
    expect(scCalls.total).toBe(1);
  });

  it("keeps YouTube and TikTok searches for the same words apart", async () => {
    await service.search("alice", "youtube", "cats");
    await service.search("alice", "tiktok", "cats");

    expect(scCalls.total).toBe(2);
  });

  it("charges a transcript the transcript price, then serves it free from cache", async () => {
    const first = await service.getTranscript("alice", tt(TT_VIDEO_ID));
    const again = await service.getTranscript("bob", tt(TT_VIDEO_ID));

    expect(first).toMatchObject({ key: `tiktok:transcript:${TT_VIDEO_ID}`, creditsCharged: 2 });
    expect(first.value.available).toBe(true);
    expect(again).toMatchObject({ source: "cache", creditsCharged: 0 });
    expect(await service.getUsage("alice")).toMatchObject({ used: 2 });
  });

  it.each([
    ["TikTok", tt(TT_NO_TRANSCRIPT_ID)],
    ["YouTube", ytRef(SC_YT_NO_CAPTIONS_ID)],
  ])("'no transcript' on %s is a normal, free answer, and is cached", async (_label, ref) => {
    const first = await service.getTranscript("alice", ref);
    const again = await service.getTranscript("alice", ref);

    expect(first.value).toEqual({ available: false, reason: "no_captions" });
    expect(first.creditsCharged).toBe(0);
    expect(again.source).toBe("cache"); // not asked upstream twice
    expect(await service.getUsage("alice")).toMatchObject({ used: 0 });
  });

  it("charges video details and comments on both platforms", async () => {
    await service.getVideoWithComments("alice", ytRef(SC_YT_VIDEO_ID));
    await service.getVideoWithComments("alice", tt(TT_VIDEO_ID));

    expect(await service.getUsage("alice")).toMatchObject({ used: 2 * (1 + 2) });
  });
});

describe("VideoService: unsupported features", () => {
  it("refuses TikTok and transcripts on the YouTube Data API provider for free, without a network call", async () => {
    const ledger = new InMemoryCreditLedger({ limit: 20 });
    const service = createVideoService({
      provider: createYouTubeProvider(createYouTubeClient({ apiKey: "test-key" })),
      ledger,
      cache: createCachedFetch(new InMemoryCacheStore()),
    });

    await expect(service.search("alice", "tiktok", "cats")).rejects.toBeInstanceOf(
      UnsupportedError,
    );
    await expect(service.getTranscript("alice", yt(VIDEO_ID))).rejects.toBeInstanceOf(
      UnsupportedError,
    );
    expect(await ledger.getEntries("alice")).toEqual([]);
    expect(youtubeCalls.total).toBe(0);
  });
});
