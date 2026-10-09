import type { NextRequest } from "next/server";
import type { TranscriptResponse } from "@/lib/api/types";
import { getVideoService } from "@/lib/container";
import { handleApi, parseInput, toCacheMeta } from "@/lib/http/handler";
import { videoParamsSchema } from "@/lib/http/params";

export const dynamic = "force-dynamic";

/**
 * GET /api/videos/:platform/:id/transcript. Separate from the details route so
 * it's only paid for when someone asks for it. "No transcript" is a 200 with
 * `available: false` and costs nothing.
 */
export function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string; id: string }> },
) {
  return handleApi(request, async ({ userId }): Promise<TranscriptResponse> => {
    const ref = parseInput(videoParamsSchema, await context.params);
    const service = getVideoService();

    const transcript = await service.getTranscript(userId, ref);
    return {
      transcript: { data: transcript.value, meta: toCacheMeta(transcript) },
      credits: await service.getUsage(userId),
    };
  });
}
