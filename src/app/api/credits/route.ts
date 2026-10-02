import type { NextRequest } from "next/server";
import type { CreditsResponse } from "@/lib/api/types";
import { getContainer } from "@/lib/container";
import { handleApi } from "@/lib/http/handler";

export const dynamic = "force-dynamic";

/** GET /api/credits: the current user's balance. Never calls YouTube. */
export function GET(request: NextRequest) {
  return handleApi(request, async ({ userId }): Promise<CreditsResponse> => ({
    credits: await getContainer().ledger.getUsage(userId),
  }));
}
