import type { NextRequest } from "next/server";
import { z } from "zod";
import type { ResolveResponse } from "@/lib/api/types";
import { handleApi, parseInput } from "@/lib/http/handler";
import { resolveVideoInput } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ url: z.string().trim().min(1, "Paste a link").max(2048) });

/** GET /api/resolve?url=...: a pasted YouTube/TikTok link -> { platform, id }. Never costs credits. */
export function GET(request: NextRequest) {
  return handleApi(request, async (): Promise<ResolveResponse> => {
    const { url } = parseInput(paramsSchema, {
      url: request.nextUrl.searchParams.get("url") ?? "",
    });
    return { ref: await resolveVideoInput(url) };
  });
}
