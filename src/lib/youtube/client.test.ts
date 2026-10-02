import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  COMMENTS_DISABLED_VIDEO_ID,
  MISSING_VIDEO_ID,
  VIDEO_ID,
  commentThreadsListResponse,
  searchListResponse,
  youtubeErrorBody,
} from "@/test/fixtures";
import { youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { createYouTubeClient } from "./client";
import { NotFoundError, RateLimitError, UpstreamError } from "./errors";
import { decodeHtmlEntities } from "./html-entities";

const API_KEY = "test-key-SECRET";
const client = createYouTubeClient({ apiKey: API_KEY });

describe("YouTube client: valid responses", () => {
  it("searches videos and maps results to domain objects", async () => {
    let requestUrl: URL | undefined;
    server.use(
      http.get(youtubeUrl("search"), ({ request }) => {
        requestUrl = new URL(request.url);
        return HttpResponse.json(searchListResponse("react hooks"));
      }),
    );

    const results = await client.searchVideos("react hooks", { maxResults: 5 });

    expect(requestUrl?.searchParams.get("q")).toBe("react hooks");
    expect(requestUrl?.searchParams.get("type")).toBe("video");
    expect(requestUrl?.searchParams.get("maxResults")).toBe("5");
    expect(requestUrl?.searchParams.get("key")).toBe(API_KEY);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: VIDEO_ID,
      title: "Learn react hooks & more in 10 minutes", // HTML entities decoded
      description: "Description for video 1",
      channelTitle: "Channel 1",
      publishedAt: "2024-01-15T12:00:00Z",
      thumbnailUrl: "https://i.ytimg.com/vi/vid00000001/hqdefault.jpg",
    });
    expect(results[1]?.title).toBe("Don't make these mistakes");
  });

  it("fetches video details with numeric statistics", async () => {
    const video = await client.getVideo(VIDEO_ID);

    expect(video).toMatchObject({
      id: VIDEO_ID,
      duration: "PT10M3S",
      viewCount: 123456,
      likeCount: 7890,
      commentCount: 321,
    });
  });

  it("returns null for statistics the owner has hidden", async () => {
    server.use(
      http.get(youtubeUrl("videos"), () =>
        HttpResponse.json({
          items: [
            {
              id: VIDEO_ID,
              snippet: { publishedAt: "2024-01-01T00:00:00Z", title: "t", channelTitle: "c" },
              statistics: { viewCount: "10" },
            },
          ],
        }),
      ),
    );

    const video = await client.getVideo(VIDEO_ID);

    expect(video).toMatchObject({ viewCount: 10, likeCount: null, commentCount: null });
    expect(video.thumbnailUrl).toBeNull();
    expect(video.description).toBe("");
  });

  it("fetches top comments ordered by relevance as plain text", async () => {
    let requestUrl: URL | undefined;
    server.use(
      http.get(youtubeUrl("commentThreads"), ({ request }) => {
        requestUrl = new URL(request.url);
        return HttpResponse.json(commentThreadsListResponse(VIDEO_ID));
      }),
    );

    const result = await client.getTopComments(VIDEO_ID);

    expect(requestUrl?.searchParams.get("order")).toBe("relevance");
    expect(requestUrl?.searchParams.get("textFormat")).toBe("plainText");
    expect(result.disabled).toBe(false);
    expect(result.comments[0]).toEqual({
      id: "thread-1",
      authorName: "@viewer1",
      authorAvatarUrl: "https://yt3.ggpht.com/avatar1",
      text: "This finally made useEffect click for me.",
      likeCount: 420,
      replyCount: 1,
      publishedAt: "2024-02-01T09:30:00Z",
    });
  });

  it("treats commentsDisabled as an empty, disabled result rather than an error", async () => {
    await expect(client.getTopComments(COMMENTS_DISABLED_VIDEO_ID)).resolves.toEqual({
      comments: [],
      disabled: true,
    });
  });
});

describe("YouTube client: malformed responses", () => {
  it("rejects a search response missing required fields", async () => {
    server.use(
      http.get(youtubeUrl("search"), () =>
        HttpResponse.json({ items: [{ id: { videoId: "x" }, snippet: { title: 42 } }] }),
      ),
    );

    const attempt = client.searchVideos("cats");
    await expect(attempt).rejects.toBeInstanceOf(UpstreamError);
    await expect(attempt).rejects.toThrow(/unexpected response shape/);
  });

  it("rejects a response with no items array", async () => {
    server.use(http.get(youtubeUrl("videos"), () => HttpResponse.json({ kind: "oops" })));
    await expect(client.getVideo(VIDEO_ID)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("rejects a non-JSON body", async () => {
    server.use(http.get(youtubeUrl("search"), () => HttpResponse.text("<html>bad gateway</html>")));
    await expect(client.searchVideos("cats")).rejects.toThrow(/invalid JSON/);
  });

  it("rejects statistics that aren't numeric strings", async () => {
    server.use(
      http.get(youtubeUrl("videos"), () =>
        HttpResponse.json({
          items: [
            {
              id: VIDEO_ID,
              snippet: { publishedAt: "2024-01-01T00:00:00Z", title: "t", channelTitle: "c" },
              statistics: { viewCount: "lots" },
            },
          ],
        }),
      ),
    );
    await expect(client.getVideo(VIDEO_ID)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("YouTube client: error mapping", () => {
  it.each(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"])(
    "maps 403 %s to RateLimitError",
    async (reason) => {
      server.use(
        http.get(youtubeUrl("search"), () =>
          HttpResponse.json(youtubeErrorBody(403, reason), { status: 403 }),
        ),
      );

      const attempt = client.searchVideos("cats");
      await expect(attempt).rejects.toBeInstanceOf(RateLimitError);
      await expect(attempt).rejects.toMatchObject({ status: 403, reason });
    },
  );

  it("maps 429 to RateLimitError and reads Retry-After", async () => {
    server.use(
      http.get(
        youtubeUrl("search"),
        () => new HttpResponse(null, { status: 429, headers: { "Retry-After": "30" } }),
      ),
    );

    await expect(client.searchVideos("cats")).rejects.toMatchObject({
      constructor: RateLimitError,
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it("maps a non-quota 403 (e.g. forbidden) to UpstreamError, not RateLimitError", async () => {
    server.use(
      http.get(youtubeUrl("search"), () =>
        HttpResponse.json(youtubeErrorBody(403, "forbidden"), { status: 403 }),
      ),
    );

    const attempt = client.searchVideos("cats");
    await expect(attempt).rejects.toBeInstanceOf(UpstreamError);
    await expect(attempt).rejects.not.toBeInstanceOf(RateLimitError);
  });

  it("maps 404 to NotFoundError", async () => {
    await expect(client.getTopComments(MISSING_VIDEO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps an empty videos.list result to NotFoundError", async () => {
    await expect(client.getVideo(MISSING_VIDEO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 5xx to UpstreamError with the status", async () => {
    server.use(http.get(youtubeUrl("search"), () => new HttpResponse("oops", { status: 503 })));
    await expect(client.searchVideos("cats")).rejects.toMatchObject({
      constructor: UpstreamError,
      status: 503,
    });
  });

  it("maps network failures to UpstreamError", async () => {
    server.use(http.get(youtubeUrl("search"), () => HttpResponse.error()));
    await expect(client.searchVideos("cats")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("never leaks the API key in error messages", async () => {
    server.use(http.get(youtubeUrl("search"), () => new HttpResponse(null, { status: 500 })));

    const error = await client.searchVideos("cats").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamError);
    expect(String((error as Error).message)).not.toContain(API_KEY);
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named, decimal and hex entities and leaves unknown ones alone", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry &#39;24 &#x1F600; &bogus;")).toBe(
      "Tom & Jerry '24 \u{1F600} &bogus;",
    );
  });
});
