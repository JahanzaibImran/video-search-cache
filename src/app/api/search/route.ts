import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SearchResponse } from "@/lib/api/types";
import { getVideoService } from "@/lib/container";
import { handleApi, parseInput, toCacheMeta } from "@/lib/http/handler";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().min(1, "Enter a search term").max(100, "Keep it under 100 characters"),
});

/** GET /api/search?q=react+hooks */
export function GET(request: NextRequest) {
  return handleApi(request, async ({ userId }): Promise<SearchResponse> => {
    const { q } = parseInput(searchParamsSchema, {
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    const service = getVideoService();

    const result = await service.search(userId, q);
    return {
      query: q,
      results: result.value,
      meta: toCacheMeta(result),
      credits: await service.getUsage(userId),
    };
  });
}
