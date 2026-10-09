import { z } from "zod";
import { PLATFORMS } from "@/lib/providers/types";
import { isValidVideoId } from "@/lib/providers/urls";

export const platformSchema = z.enum(PLATFORMS, { message: "platform must be youtube or tiktok" });

/** `/api/videos/{platform}/{id}`: the ID must match that platform's format. */
export const videoParamsSchema = z
  .object({ platform: platformSchema, id: z.string() })
  .refine(({ platform, id }) => isValidVideoId(platform, id), {
    message: "Not a valid video id for that platform",
    path: ["id"],
  });
