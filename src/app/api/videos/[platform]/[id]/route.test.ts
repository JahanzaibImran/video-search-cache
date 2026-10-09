import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiErrorResponse, CommentsSlot, VideoCommentsResponse } from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits";
import { COMMENTS_DISABLED_VIDEO_ID, MISSING_VIDEO_ID, VIDEO_ID } from "@/test/fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { scCalls, scUrl } from "@/test/msw/scrapecreators-handlers";
import { apiRequest, setupApp } from "@/test/routes";
import { TT_COMMENTS_OFF_ID, TT_NO_COMMENTS_ID, TT_VIDEO_ID } from "@/test/scrapecreators-fixtures";
import { GET } from "./route";

const getVideo = (platform: string, id: string, userId = "alice") =>
  GET(apiRequest(`/api/videos/${platform}/${id}`, { userId }), {
    params: Promise.resolve({ platform, id }),
  });
const getComments = (id: string, userId = "alice") => getVideo("youtube", id, userId);

/** The comments slot when it loaded; fails the test if it holds an error instead. */
function loaded(slot: CommentsSlot) {
  if ("error" in slot) throw new Error(`comments failed: ${slot.error.code}`);
  return slot;
}

describe("GET /api/videos/[platform]/[id]", () => {
  beforeEach(() => setupApp());

  it("returns video details and top comments, each with cache meta (happy path)", async () => {
    const response = await getComments(VIDEO_ID);
    const body = (await response.json()) as VideoCommentsResponse;

    expect(response.status).toBe(200);
    expect(body.video.data).toMatchObject({ id: VIDEO_ID, viewCount: 123456 });
    expect(body.video.meta).toMatchObject({
      cacheKey: `youtube:video:${VIDEO_ID}`,
      cached: false,
      creditsCharged: CREDIT_COSTS.videoDetails,
    });
    expect(loaded(body.comments).data.comments).toHaveLength(2);
    expect(loaded(body.comments).meta).toMatchObject({
      cacheKey: `youtube:comments:${VIDEO_ID}`,
      cached: false,
      creditsCharged: CREDIT_COSTS.comments,
    });
    expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails + CREDIT_COSTS.comments);
  });

  it("is free the second time", async () => {
    await getComments(VIDEO_ID);
    const body = (await (await getComments(VIDEO_ID, "bob")).json()) as VideoCommentsResponse;

    expect(body.video.meta.cached).toBe(true);
    expect(loaded(body.comments).meta.cached).toBe(true);
    expect(body.credits.used).toBe(0);
    expect(youtubeCalls.total).toBe(2);
  });

  it("returns 402 when the credit limit is reached, without calling YouTube", async () => {
    setupApp({ CREDIT_LIMIT: "0" });

    const response = await getComments(VIDEO_ID);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("CREDIT_LIMIT_REACHED");
    expect(youtubeCalls.total).toBe(0);
  });

  it("reports a comments failure in the comments slot, still returning the video (200)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(youtubeUrl("commentThreads"), () => new HttpResponse(null, { status: 503 })),
    );

    const response = await getComments(VIDEO_ID);
    const body = (await response.json()) as VideoCommentsResponse;

    expect(response.status).toBe(200);
    expect(body.video.data.id).toBe(VIDEO_ID);
    expect(body.comments).toEqual({
      error: { code: "UPSTREAM_ERROR", message: expect.stringContaining("nothing was charged") },
    });
    // The video call succeeded and stays charged; the failed comments call is refunded.
    expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails);
  });

  it("returns 404 for a video that doesn't exist", async () => {
    const response = await getComments(MISSING_VIDEO_ID);

    expect(response.status).toBe(404);
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with disabled: true when comments are turned off", async () => {
    const body = (await (
      await getComments(COMMENTS_DISABLED_VIDEO_ID)
    ).json()) as VideoCommentsResponse;

    expect(loaded(body.comments).data).toEqual({ comments: [], disabled: true });
  });

  it("rejects an invalid video id with 400 before touching YouTube", async () => {
    const response = await getComments("not-an-id");

    expect(response.status).toBe(400);
    expect(youtubeCalls.total).toBe(0);
  });

  it.each([
    ["unknown platform", "vimeo", "12345678901"],
    ["a TikTok ID on the YouTube platform", "youtube", "7499229683859426602"],
    ["a YouTube ID on the TikTok platform", "tiktok", "dQw4w9WgXcQ"],
  ])("rejects %s with 400", async (_label, platform, id) => {
    const response = await getVideo(platform, id);
    expect(response.status).toBe(400);
  });

  it("returns 422 UNSUPPORTED for TikTok on the YouTube Data API provider, charging nothing", async () => {
    const response = await getVideo("tiktok", TT_VIDEO_ID);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("UNSUPPORTED");
    expect(body.credits?.used).toBe(0);
  });

  describe("with VIDEO_PROVIDER=scrapecreators", () => {
    beforeEach(() => setupApp({ VIDEO_PROVIDER: "scrapecreators" }));

    it("serves a TikTok video with comments, charged per action", async () => {
      const body = (await (await getVideo("tiktok", TT_VIDEO_ID)).json()) as VideoCommentsResponse;

      expect(body.video.data).toMatchObject({ id: TT_VIDEO_ID, platform: "tiktok" });
      expect(body.video.meta.cacheKey).toBe(`tiktok:video:${TT_VIDEO_ID}`);
      expect(loaded(body.comments).data.comments).toHaveLength(1);
      expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails + CREDIT_COSTS.comments);
      expect(scCalls.total).toBe(2);
      expect(youtubeCalls.total).toBe(0); // the YouTube Data API is not involved
    });

    it("comments turned off: 200, disabled: true, comments free", async () => {
      const body = (await (
        await getVideo("tiktok", TT_COMMENTS_OFF_ID)
      ).json()) as VideoCommentsResponse;

      expect(loaded(body.comments)).toMatchObject({
        data: { comments: [], disabled: true },
        meta: { creditsCharged: 0 },
      });
      expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails);
    });

    it("no comments yet: 200, disabled: false, empty list, comments charged", async () => {
      const body = (await (
        await getVideo("tiktok", TT_NO_COMMENTS_ID)
      ).json()) as VideoCommentsResponse;

      expect(loaded(body.comments)).toMatchObject({
        data: { comments: [], disabled: false },
        meta: { creditsCharged: CREDIT_COSTS.comments },
      });
      expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails + CREDIT_COSTS.comments);
    });

    it("comments fetch failed: 200 with the video, an error in the comments slot, comments free", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      server.use(
        http.get(scUrl("/v1/tiktok/video/comments"), () => new HttpResponse(null, { status: 500 })),
      );

      const body = (await (await getVideo("tiktok", TT_VIDEO_ID)).json()) as VideoCommentsResponse;

      expect(body.video.data.id).toBe(TT_VIDEO_ID);
      expect(body.comments).toMatchObject({ error: { code: "UPSTREAM_ERROR" } });
      expect(body.credits.used).toBe(CREDIT_COSTS.videoDetails);
    });
  });
});
