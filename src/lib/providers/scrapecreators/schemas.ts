import { z } from "zod";

/**
 * Zod schemas for the ScrapeCreators endpoints we use.
 *
 * Source: the per-endpoint OpenAPI files at
 * https://docs.scrapecreators.com/{path}/openapi.json (fetched 2026-10-10).
 * Those files publish response *examples*, not formal schemas, so these are
 * written from the examples and kept defensive:
 * - only fields we actually read are declared; unknown fields are stripped;
 * - anything that could plausibly be absent is `nullish` and mapped to null;
 * - a field we can't do without (an ID, a title, the list itself) is required,
 *   so a breaking upstream change becomes a clear UpstreamError, not
 *   `undefined` leaking into the UI.
 */

/** ScrapeCreators wraps every response in this; `success: false` is an error. */
const envelope = {
  success: z.boolean().optional(),
  credits_charged: z.number().nullish(),
};

const count = z.number().int().nonnegative().nullish();

// --- YouTube -----------------------------------------------------------------

const youtubeSearchItem = z.object({
  id: z.string(),
  url: z.string().nullish(),
  title: z.string(),
  thumbnail: z.string().nullish(),
  channel: z.object({ title: z.string().nullish() }).nullish(),
  /** ISO timestamp, estimated by ScrapeCreators from "2 years ago". */
  publishedTime: z.string().nullish(),
});

/** GET /v1/youtube/search */
export const youtubeSearchSchema = z.object({
  ...envelope,
  videos: z.array(youtubeSearchItem).nullish(),
  shorts: z.array(youtubeSearchItem).nullish(),
});

/** GET /v1/youtube/video */
export const youtubeVideoSchema = z.object({
  ...envelope,
  id: z.string(),
  url: z.string().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  thumbnail: z.string().nullish(),
  channel: z.object({ title: z.string().nullish() }).nullish(),
  publishDate: z.string().nullish(),
  viewCountInt: count,
  likeCountInt: count,
  commentCountInt: count,
  durationMs: z.number().nonnegative().nullish(),
});

/** GET /v1/youtube/video/comments */
export const youtubeCommentsSchema = z.object({
  ...envelope,
  comments: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
        publishedTime: z.string().nullish(),
        author: z.object({ name: z.string().nullish(), avatarUrl: z.string().nullish() }).nullish(),
        engagement: z.object({ likes: count, replies: count }).nullish(),
      }),
    )
    .nullish(),
  // TODO(assumption): not in the published example. If ScrapeCreators flags
  // turned-off comments, we expect one of these. Without it we can't tell
  // "turned off" from "none yet" on this endpoint.
  commentsDisabled: z.boolean().nullish(),
  comments_disabled: z.boolean().nullish(),
});

/** GET /v1/youtube/video/transcript. Fields are null when no caption track exists (0 credits). */
export const youtubeTranscriptSchema = z.object({
  ...envelope,
  transcript: z
    .array(
      z.object({
        text: z.string(),
        // The example sends milliseconds as strings ("160").
        startMs: z.coerce.number().nonnegative(),
        endMs: z.coerce.number().nonnegative().nullish(),
      }),
    )
    .nullish(),
  transcript_only_text: z.string().nullish(),
  language: z.string().nullish(),
});

// --- TikTok ------------------------------------------------------------------

/** TikTok's post object ("aweme"), shared by search results and /v2/tiktok/video. */
const tiktokAweme = z.object({
  aweme_id: z.string(),
  desc: z.string().nullish(),
  url: z.string().nullish(),
  /** Unix seconds. */
  create_time: z.number().nullish(),
  author: z.object({ nickname: z.string().nullish(), unique_id: z.string().nullish() }).nullish(),
  statistics: z.object({ play_count: count, digg_count: count, comment_count: count }).nullish(),
  video: z
    .object({
      cover: z.object({ url_list: z.array(z.string()) }).nullish(),
      /** Milliseconds. */
      duration: z.number().nonnegative().nullish(),
    })
    .nullish(),
  // TODO(assumption): TikTok's per-post comment setting (3 = comments off).
  // Present on raw TikTok posts but not in the trimmed published example.
  item_comment_settings: z.number().nullish(),
});

export type TikTokAweme = z.infer<typeof tiktokAweme>;

/** GET /v1/tiktok/search/keyword. Items are posts directly (no `aweme_info` wrapper, despite the docs' prose). */
export const tiktokSearchSchema = z.object({
  ...envelope,
  search_item_list: z.array(tiktokAweme).nullish(),
});

/** GET /v2/tiktok/video */
export const tiktokVideoSchema = z.object({
  ...envelope,
  aweme_detail: tiktokAweme,
});

/** GET /v1/tiktok/video/comments */
export const tiktokCommentsSchema = z.object({
  ...envelope,
  comments: z
    .array(
      z.object({
        // TODO(assumption): the example has no comment ID; raw TikTok uses `cid`.
        cid: z.string().nullish(),
        text: z.string(),
        create_time: z.number().nullish(),
        digg_count: count,
        reply_comment_total: count,
        user: z
          .object({
            nickname: z.string().nullish(),
            unique_id: z.string().nullish(),
            avatar_thumb: z.object({ url_list: z.array(z.string()) }).nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  total: count,
});

/** GET /v1/tiktok/video/transcript. `transcript` is a WEBVTT string, or null/empty when none exists. */
export const tiktokTranscriptSchema = z.object({
  ...envelope,
  transcript: z.string().nullish(),
});

/** Error body. TODO(assumption): only 200 responses are documented; we read either field if present. */
export const errorBodySchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});
