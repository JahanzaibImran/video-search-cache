import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SearchResponse } from "@/lib/api/types";
import { getVideoService } from "@/lib/container";
import { handleApi, parseInput, toCacheMeta } from "@/lib/http/handler";
import { platformSchema } from "@/lib/http/params";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().min(1, "Enter a search term").max(100, "Keep it under 100 characters"),
  platform: platformSchema.default("youtube"),
});

/** GET /api/search?q=react+hooks&platform=youtube|tiktok */
export function GET(request: NextRequest) {
  return handleApi(request, async ({ userId }): Promise<SearchResponse> => {
    const { searchParams } = request.nextUrl;
    const { q, platform } = parseInput(searchParamsSchema, {
      q: searchParams.get("q") ?? "",
      platform: searchParams.get("platform") ?? undefined,
    });
    const service = getVideoService();

    const result = await service.search(userId, platform, q);
    return {
      query: q,
      platform,
      results: result.value,
      meta: toCacheMeta(result),
      credits: await service.getUsage(userId),
    };
  });
}
