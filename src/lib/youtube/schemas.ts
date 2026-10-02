import { z } from "zod";

/**
 * Zod schemas for the slices of YouTube Data API v3 responses we use.
 * Unknown fields are stripped; missing required fields fail validation, so a
 * breaking upstream change shows up as a clear UpstreamError, not as
 * `undefined` leaking into the UI.
 */

const thumbnail = z.object({ url: z.string() });

const thumbnails = z
  .object({
    default: thumbnail.optional(),
    medium: thumbnail.optional(),
    high: thumbnail.optional(),
  })
  .optional();

const snippet = z.object({
  publishedAt: z.string(),
  title: z.string(),
  description: z.string().default(""),
  channelTitle: z.string(),
  thumbnails,
});

/** YouTube sends counts as numeric strings, and omits them when hidden. */
const count = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .optional()
  .transform((value) => value ?? null);

export const searchListSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({ videoId: z.string() }),
      snippet,
    }),
  ),
});

export const videosListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet,
      statistics: z.object({ viewCount: count, likeCount: count, commentCount: count }).optional(),
      contentDetails: z.object({ duration: z.string() }).optional(),
    }),
  ),
});

export const commentThreadsListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      snippet: z.object({
        totalReplyCount: z.number().int().nonnegative().default(0),
        topLevelComment: z.object({
          snippet: z.object({
            authorDisplayName: z.string(),
            authorProfileImageUrl: z.string().optional(),
            textOriginal: z.string(),
            likeCount: z.number().int().nonnegative(),
            publishedAt: z.string(),
          }),
        }),
      }),
    }),
  ),
});

/** Google's standard error envelope. Parsed leniently since it's only used for diagnostics. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export type SearchListResponse = z.infer<typeof searchListSchema>;
export type VideosListResponse = z.infer<typeof videosListSchema>;
export type CommentThreadsListResponse = z.infer<typeof commentThreadsListSchema>;
