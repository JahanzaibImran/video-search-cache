import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { SC_TEST_API_KEY, scCalls, scUrl } from "@/test/msw/scrapecreators-handlers";
import { server } from "@/test/msw/server";
import {
  SC_YT_MISSING_ID,
  SC_YT_NO_CAPTIONS_ID,
  SC_YT_SHORT_ID,
  SC_YT_VIDEO_ID,
  TT_COMMENTS_OFF_ID,
  TT_MISSING_ID,
  TT_NO_TRANSCRIPT_ID,
  TT_OTHER_ID,
  TT_VIDEO_ID,
} from "@/test/scrapecreators-fixtures";
import { NotFoundError, RateLimitError, UpstreamError } from "../errors";
import { createScrapeCreatorsClient } from "./client";

const client = createScrapeCreatorsClient({ apiKey: SC_TEST_API_KEY });
const yt = (id: string) => ({ platform: "youtube", id }) as const;
const tt = (id: string) => ({ platform: "tiktok", id }) as const;

describe("ScrapeCreators client: YouTube", () => {
  it("searches, merges videos and Shorts, and maps them to domain objects", async () => {
    let request: Request | undefined;
    server.use(
      http.get(scUrl("/v1/youtube/search"), async ({ request: r }) => {
        request = r.clone();
        return undefined; // fall through to the default fixture handler
      }),
    );

    const results = await client.search("youtube", "running");

    const url = new URL(request!.url);
    expect(url.searchParams.get("query")).toBe("running");
    expect(request!.headers.get("x-api-key")).toBe(SC_TEST_API_KEY);
    expect(url.toString()).not.toContain(SC_TEST_API_KEY); // key never in the URL

    expect(results.map((r) => r.id)).toEqual([SC_YT_VIDEO_ID, SC_YT_SHORT_ID]);
    expect(results[0]).toEqual({
      id: SC_YT_VIDEO_ID,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${SC_YT_VIDEO_ID}`,
      title: "NF - RUNNING (Audio) & running", // HTML entities decoded
      description: "",
      channelTitle: "NFrealmusic",
      publishedAt: "2023-05-28T17:08:46.499Z",
      thumbnailUrl: `https://i.ytimg.com/vi/${SC_YT_VIDEO_ID}/hq720.jpg`,
    });
    expect(results[1]?.publishedAt).toBeNull(); // Short without publishedTime
  });

  it("fetches video details, sending the canonical URL", async () => {
    let sentUrl: string | null = null;
    server.use(
      http.get(scUrl("/v1/youtube/video"), ({ request }) => {
        sentUrl = new URL(request.url).searchParams.get("url");
        return undefined;
      }),
    );

    const video = await client.getVideo(yt(SC_YT_VIDEO_ID));

    expect(sentUrl).toBe(`https://www.youtube.com/watch?v=${SC_YT_VIDEO_ID}`);
    expect(video).toMatchObject({
      id: SC_YT_VIDEO_ID,
      platform: "youtube",
      channelTitle: "Afroballer",
      description: "", // null upstream -> ""
      duration: "PT5M48S",
      viewCount: 372864,
      likeCount: 4043,
      commentCount: 358,
      commentsDisabled: null,
    });
  });

  it("fetches top comments", async () => {
    const result = await client.getComments(yt(SC_YT_VIDEO_ID));

    expect(result.disabled).toBe(false);
    expect(result.comments[0]).toEqual({
      id: "UgwVfRopfS2F-WB3aF14AaABAg",
      authorName: "@SimonT80",
      authorAvatarUrl: "https://yt3.ggpht.com/ytc/avatar=s88",
      text: expect.stringContaining("2 great coaches"),
      likeCount: 110,
      replyCount: 5,
      publishedAt: "2025-01-23T23:14:02.948Z",
    });
  });

  it("returns a transcript with plain text and timed segments", async () => {
    const result = await client.getTranscript(yt(SC_YT_VIDEO_ID));

    expect(result).toEqual({
      available: true,
      text: "welcome back to the hell farm and the backyard trails",
      language: "English",
      segments: [
        { startMs: 160, endMs: 1920, text: "welcome back to the hell farm and the" },
        { startMs: 1920, endMs: 3000, text: "backyard trails" },
      ],
    });
  });

  it("treats null transcript fields as 'no captions', not an error", async () => {
    await expect(client.getTranscript(yt(SC_YT_NO_CAPTIONS_ID))).resolves.toEqual({
      available: false,
      reason: "no_captions",
    });
  });

  it("maps 404 to NotFoundError", async () => {
    await expect(client.getVideo(yt(SC_YT_MISSING_ID))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ScrapeCreators client: TikTok", () => {
  it("searches by keyword and drops TikTok's duplicate results", async () => {
    const results = await client.search("tiktok", "wnba");

    expect(results.map((r) => r.id)).toEqual([TT_VIDEO_ID, TT_OTHER_ID]);
    expect(results[0]).toEqual({
      id: TT_VIDEO_ID,
      platform: "tiktok",
      url: `https://www.tiktok.com/@stoolpresidente/video/${TT_VIDEO_ID}`,
      title: "You can say whatever you want about the WNBA is but it’s never boring",
      description: "You can say whatever you want about the WNBA is but it’s never boring",
      channelTitle: "Dave Portnoy",
      publishedAt: "2025-06-18T02:45:25.000Z",
      thumbnailUrl: expect.stringContaining("tiktokcdn-us.com"),
    });
  });

  it("fetches video details with stats and duration", async () => {
    const video = await client.getVideo(tt(TT_VIDEO_ID));

    expect(video).toMatchObject({
      id: TT_VIDEO_ID,
      platform: "tiktok",
      duration: "PT2M54S",
      viewCount: 589745,
      likeCount: 62522,
      commentCount: 618,
      commentsDisabled: null, // setting not present in the payload -> unknown
    });
  });

  it("reports comments as disabled when the post's comment setting is 'off'", async () => {
    const video = await client.getVideo(tt(TT_COMMENTS_OFF_ID));
    expect(video.commentsDisabled).toBe(true);
  });

  it("fetches comments, falling back to a stable ID when TikTok omits one", async () => {
    const result = await client.getComments(tt(TT_VIDEO_ID));

    expect(result.comments[0]).toEqual({
      id: `${TT_VIDEO_ID}-1750216932-0`,
      authorName: "Robert Lessner",
      authorAvatarUrl: "https://p16-sign.tiktokcdn-us.com/avatar1.jpg",
      text: "DAVE BUY A TEAM",
      likeCount: 3322,
      replyCount: 14,
      publishedAt: "2025-06-18T03:22:12.000Z",
    });
  });

  it("parses the WEBVTT transcript into text and segments, without the paid AI fallback", async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(scUrl("/v1/tiktok/video/transcript"), ({ request }) => {
        params = new URL(request.url).searchParams;
        return undefined;
      }),
    );

    const result = await client.getTranscript(tt(TT_VIDEO_ID));

    expect(params?.has("use_ai_as_fallback")).toBe(false);
    expect(result).toMatchObject({
      available: true,
      text: "Alright, pizza review time. Sal's Pizza Factory.",
      segments: [{ startMs: 120 }, { startMs: 1841 }],
    });
  });

  it("treats a missing TikTok transcript as a normal 'no captions' state", async () => {
    await expect(client.getTranscript(tt(TT_NO_TRANSCRIPT_ID))).resolves.toEqual({
      available: false,
      reason: "no_captions",
    });
  });

  it("maps 404 to NotFoundError", async () => {
    await expect(client.getVideo(tt(TT_MISSING_ID))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ScrapeCreators client: errors", () => {
  it("maps 429 to RateLimitError with Retry-After", async () => {
    server.use(
      http.get(scUrl("/v1/youtube/search"), () =>
        HttpResponse.json(
          { message: "slow down" },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );

    const error = await client.search("youtube", "x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 30 });
  });

  it.each([
    [401, "auth"],
    [402, "out_of_credits"],
    [500, undefined],
  ])("maps HTTP %d to UpstreamError (reason %s)", async (status, reason) => {
    server.use(http.get(scUrl("/v1/youtube/search"), () => new HttpResponse(null, { status })));

    await expect(client.search("youtube", "x")).rejects.toMatchObject({
      constructor: UpstreamError,
      status,
      reason,
    });
  });

  it("rejects a wrong API key with an auth UpstreamError", async () => {
    const wrongKey = createScrapeCreatorsClient({ apiKey: "wrong" });
    await expect(wrongKey.search("youtube", "x")).rejects.toMatchObject({ reason: "auth" });
  });

  it("treats success: false in a 200 body as an UpstreamError", async () => {
    server.use(http.get(scUrl("/v1/youtube/search"), () => HttpResponse.json({ success: false })));

    await expect(client.search("youtube", "x")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("wraps network failures without leaking the API key", async () => {
    server.use(http.get(scUrl("/v1/youtube/search"), () => HttpResponse.error()));

    const error = (await client.search("youtube", "x").catch((e: unknown) => e)) as Error;

    expect(error).toBeInstanceOf(UpstreamError);
    expect(error.message).not.toContain(SC_TEST_API_KEY);
  });

  it("counts each upstream call (used by service tests to prove cache hits are free)", async () => {
    await client.search("tiktok", "a");
    await client.getVideo(tt(TT_VIDEO_ID));
    expect(scCalls.count("/v1/tiktok/search/keyword")).toBe(1);
    expect(scCalls.total).toBe(2);
  });
});
