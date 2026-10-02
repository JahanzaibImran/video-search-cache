import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiErrorResponse, VideoCommentsResponse } from "@/lib/api/types";
import { COMMENTS_DISABLED_VIDEO_ID, MISSING_VIDEO_ID, VIDEO_ID } from "@/test/fixtures";
import { youtubeCalls, youtubeUrl } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { apiRequest, setupApp } from "@/test/routes";
import { GET } from "./route";

const getComments = (id: string, userId = "alice") =>
  GET(apiRequest(`/api/videos/${id}/comments`, { userId }), {
    params: Promise.resolve({ id }),
  });

describe("GET /api/videos/[id]/comments", () => {
  beforeEach(() => setupApp());

  it("returns video details and top comments, each with cache meta (happy path)", async () => {
    const response = await getComments(VIDEO_ID);
    const body = (await response.json()) as VideoCommentsResponse;

    expect(response.status).toBe(200);
    expect(body.video.data).toMatchObject({ id: VIDEO_ID, viewCount: 123456 });
    expect(body.video.meta).toMatchObject({ cacheKey: `yt:video:${VIDEO_ID}`, cached: false });
    expect(body.comments.data.comments).toHaveLength(2);
    expect(body.comments.meta).toMatchObject({
      cacheKey: `yt:comments:${VIDEO_ID}`,
      cached: false,
    });
    expect(body.credits.used).toBe(2);
  });

  it("is free the second time", async () => {
    await getComments(VIDEO_ID);
    const body = (await (await getComments(VIDEO_ID, "bob")).json()) as VideoCommentsResponse;

    expect(body.video.meta.cached).toBe(true);
    expect(body.comments.meta.cached).toBe(true);
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

  it("maps an upstream failure to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(youtubeUrl("commentThreads"), () => new HttpResponse(null, { status: 503 })),
    );

    const response = await getComments(VIDEO_ID);
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    // The video call succeeded and stays cached and charged; the failed comments call is refunded.
    expect(body.credits?.used).toBe(1);
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

    expect(body.comments.data).toEqual({ comments: [], disabled: true });
  });

  it("rejects an invalid video id with 400 before touching YouTube", async () => {
    const response = await getComments("not-an-id");

    expect(response.status).toBe(400);
    expect(youtubeCalls.total).toBe(0);
  });
});
