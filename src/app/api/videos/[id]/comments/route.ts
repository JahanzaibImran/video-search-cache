import type { NextRequest } from "next/server";
import { z } from "zod";
import type { VideoCommentsResponse } from "@/lib/api/types";
import { getVideoService } from "@/lib/container";
import { handleApi, parseInput, toCacheMeta } from "@/lib/http/handler";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Not a valid YouTube video id"),
});

/** GET /api/videos/:id/comments: video details plus its top comments. */
export function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ userId }): Promise<VideoCommentsResponse> => {
    const { id } = parseInput(paramsSchema, await context.params);
    const service = getVideoService();

    const { video, comments } = await service.getVideoWithComments(userId, id);
    return {
      video: { data: video.value, meta: toCacheMeta(video) },
      comments: { data: comments.value, meta: toCacheMeta(comments) },
      credits: await service.getUsage(userId),
    };
  });
}
