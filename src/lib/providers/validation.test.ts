import { http, HttpResponse, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import { createYouTubeClient, createYouTubeProvider } from "@/lib/youtube";
import { youtubeUrl } from "@/test/msw/handlers";
import { SC_TEST_API_KEY, scUrl } from "@/test/msw/scrapecreators-handlers";
import { server } from "@/test/msw/server";
import { SC_YT_VIDEO_ID, TT_VIDEO_ID } from "@/test/scrapecreators-fixtures";
import { UpstreamError } from "./errors";
import { createScrapeCreatorsClient } from "./scrapecreators/client";
import type { VideoProvider } from "./types";

/**
 * Step 5: every provider response is validated with Zod at the boundary. Any
 * unexpected shape must become a typed UpstreamError (reason
 * "invalid_response" or "invalid_json"), never a crash and never `undefined`
 * leaking into the app.
 */

const scrapeCreators = createScrapeCreatorsClient({ apiKey: SC_TEST_API_KEY });
const youtubeApi = createYouTubeProvider(createYouTubeClient({ apiKey: "yt-SECRET-key" }));

type Call = (provider: VideoProvider) => Promise<unknown>;

const SC_ENDPOINTS: [string, string, Call][] = [
  ["YouTube search", "/v1/youtube/search", (p) => p.search("youtube", "x")],
  [
    "YouTube video",
    "/v1/youtube/video",
    (p) => p.getVideo({ platform: "youtube", id: SC_YT_VIDEO_ID }),
  ],
  [
    "YouTube comments",
    "/v1/youtube/video/comments",
    (p) => p.getComments({ platform: "youtube", id: SC_YT_VIDEO_ID }),
  ],
  [
    "YouTube transcript",
    "/v1/youtube/video/transcript",
    (p) => p.getTranscript({ platform: "youtube", id: SC_YT_VIDEO_ID }),
  ],
  ["TikTok search", "/v1/tiktok/search/keyword", (p) => p.search("tiktok", "x")],
  ["TikTok video", "/v2/tiktok/video", (p) => p.getVideo({ platform: "tiktok", id: TT_VIDEO_ID })],
  [
    "TikTok comments",
    "/v1/tiktok/video/comments",
    (p) => p.getComments({ platform: "tiktok", id: TT_VIDEO_ID }),
  ],
  [
    "TikTok transcript",
    "/v1/tiktok/video/transcript",
    (p) => p.getTranscript({ platform: "tiktok", id: TT_VIDEO_ID }),
  ],
];

/** Bodies that are valid JSON but the wrong shape for every endpoint above. */
const MALFORMED_BODIES: [string, JsonBodyType][] = [
  ["null", null],
  ["an array", [1, 2, 3]],
  ["a string", "OK"],
  [
    "wrong types everywhere",
    { videos: "nope", comments: 42, transcript: 7, aweme_detail: [], search_item_list: {} },
  ],
];

describe("ScrapeCreators: malformed responses become typed UpstreamErrors", () => {
  for (const [endpointLabel, path, call] of SC_ENDPOINTS) {
    describe(endpointLabel, () => {
      it.each(MALFORMED_BODIES)("body is %s", async (_label, body) => {
        server.use(http.get(scUrl(path), () => HttpResponse.json(body)));

        const error = await call(scrapeCreators).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({
          code: "UPSTREAM_ERROR",
          reason: "invalid_response",
          message: `ScrapeCreators ${path} returned an unexpected response shape`,
        });
      });

      it("body isn't JSON", async () => {
        server.use(http.get(scUrl(path), () => new HttpResponse("<html>502 Bad Gateway</html>")));

        await expect(call(scrapeCreators)).rejects.toMatchObject({
          constructor: UpstreamError,
          reason: "invalid_json",
        });
      });
    });
  }

  it("a single wrong field type is enough (an ID that's a number)", async () => {
    server.use(
      http.get(scUrl("/v1/youtube/search"), () =>
        HttpResponse.json({ success: true, videos: [{ id: 12345, title: "t" }] }),
      ),
    );

    await expect(scrapeCreators.search("youtube", "x")).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("keeps the Zod details as the cause, for server logs", async () => {
    server.use(http.get(scUrl("/v2/tiktok/video"), () => HttpResponse.json({ aweme_detail: {} })));

    const error = (await scrapeCreators
      .getVideo({ platform: "tiktok", id: TT_VIDEO_ID })
      .catch((e: unknown) => e)) as UpstreamError;

    expect(String(error.cause)).toContain("aweme_id");
    expect(error.message).not.toContain(SC_TEST_API_KEY);
  });

  it("success: false is a provider failure, not a shape problem", async () => {
    server.use(
      http.get(scUrl("/v1/youtube/search"), () =>
        HttpResponse.json({ success: false, message: "x" }),
      ),
    );

    const error = (await scrapeCreators
      .search("youtube", "x")
      .catch((e: unknown) => e)) as UpstreamError;

    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.message).toContain("reported success: false");
    expect(error.reason).toBeUndefined();
  });
});

describe("YouTube Data API: malformed responses become typed UpstreamErrors", () => {
  it.each(MALFORMED_BODIES)("search body is %s", async (_label, body) => {
    server.use(http.get(youtubeUrl("search"), () => HttpResponse.json(body)));

    const error = (await youtubeApi
      .search("youtube", "x")
      .catch((e: unknown) => e)) as UpstreamError;

    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ code: "UPSTREAM_ERROR", reason: "invalid_response" });
    expect(error.message).not.toContain("yt-SECRET-key"); // the key is in the URL, never the message
  });

  it("an item missing a required field fails the whole response", async () => {
    server.use(
      http.get(youtubeUrl("videos"), () => HttpResponse.json({ items: [{ id: "vid00000001" }] })),
    );

    await expect(
      youtubeApi.getVideo({ platform: "youtube", id: "vid00000001" }),
    ).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
