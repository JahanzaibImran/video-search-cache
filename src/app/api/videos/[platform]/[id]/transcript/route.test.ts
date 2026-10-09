import { beforeEach, describe, expect, it } from "vitest";
import type { ApiErrorResponse, TranscriptResponse } from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits";
import { VIDEO_ID } from "@/test/fixtures";
import { scCalls } from "@/test/msw/scrapecreators-handlers";
import { apiRequest, setupApp } from "@/test/routes";
import {
  SC_YT_NO_CAPTIONS_ID,
  SC_YT_VIDEO_ID,
  TT_NO_TRANSCRIPT_ID,
  TT_VIDEO_ID,
} from "@/test/scrapecreators-fixtures";
import { GET } from "./route";

const getTranscript = (platform: string, id: string, userId = "alice") =>
  GET(apiRequest(`/api/videos/${platform}/${id}/transcript`, { userId }), {
    params: Promise.resolve({ platform, id }),
  });

describe("GET /api/videos/[platform]/[id]/transcript", () => {
  beforeEach(() => setupApp({ VIDEO_PROVIDER: "scrapecreators" }));

  it.each([
    ["youtube", SC_YT_VIDEO_ID],
    ["tiktok", TT_VIDEO_ID],
  ])("returns a %s transcript and charges the transcript price", async (platform, id) => {
    const response = await getTranscript(platform, id);
    const body = (await response.json()) as TranscriptResponse;

    expect(response.status).toBe(200);
    expect(body.transcript.data).toMatchObject({ available: true, text: expect.any(String) });
    expect(body.transcript.meta).toMatchObject({
      cacheKey: `${platform}:transcript:${id}`,
      creditsCharged: CREDIT_COSTS.transcript,
    });
    expect(body.credits.used).toBe(CREDIT_COSTS.transcript);
  });

  it.each([
    ["youtube", SC_YT_NO_CAPTIONS_ID],
    ["tiktok", TT_NO_TRANSCRIPT_ID],
  ])(
    "answers 'no transcript' on %s with 200, available: false, and no charge",
    async (platform, id) => {
      const response = await getTranscript(platform, id);
      const body = (await response.json()) as TranscriptResponse;

      expect(response.status).toBe(200);
      expect(body.transcript.data).toEqual({ available: false, reason: "no_captions" });
      expect(body.transcript.meta.creditsCharged).toBe(0);
      expect(body.credits.used).toBe(0);
    },
  );

  it("serves a repeat request from cache for free", async () => {
    await getTranscript("tiktok", TT_VIDEO_ID);
    const body = (await (
      await getTranscript("tiktok", TT_VIDEO_ID, "bob")
    ).json()) as TranscriptResponse;

    expect(body.transcript.meta).toMatchObject({ cached: true, creditsCharged: 0 });
    expect(body.credits.used).toBe(0);
    expect(scCalls.total).toBe(1);
  });

  it("returns 422 on the YouTube Data API provider, which can't fetch transcripts", async () => {
    setupApp({ VIDEO_PROVIDER: "youtube" });

    const response = await getTranscript("youtube", VIDEO_ID);

    expect(response.status).toBe(422);
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe("UNSUPPORTED");
  });
});
