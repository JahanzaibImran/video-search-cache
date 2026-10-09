import type { NextRequest } from "next/server";
import type { VideoCommentsResponse } from "@/lib/api/types";
import { getVideoService } from "@/lib/container";
import { handleApi, parseInput, toCacheMeta } from "@/lib/http/handler";
import { videoParamsSchema } from "@/lib/http/params";

export const dynamic = "force-dynamic";

/** GET /api/videos/:platform/:id: video details plus its top comments. */
export function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string; id: string }> },
) {
  return handleApi(request, async ({ userId }): Promise<VideoCommentsResponse> => {
    const ref = parseInput(videoParamsSchema, await context.params);
    const service = getVideoService();

    const { video, comments } = await service.getVideoWithComments(userId, ref);
    return {
      video: { data: video.value, meta: toCacheMeta(video) },
      comments: { data: comments.value, meta: toCacheMeta(comments) },
      credits: await service.getUsage(userId),
    };
  });
}
