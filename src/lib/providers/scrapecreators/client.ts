import type { z } from "zod";
import { decodeHtmlEntities } from "@/lib/youtube/html-entities";
import { msToIsoDuration, parseWebVtt, unixToIso } from "../convert";
import { NotFoundError, RateLimitError, UpstreamError } from "../errors";
import type {
  CommentsResult,
  Platform,
  ProviderCapabilities,
  TranscriptResult,
  VideoDetails,
  VideoProvider,
  VideoRef,
  VideoSummary,
} from "../types";
import { canonicalVideoUrl } from "../urls";
import {
  errorBodySchema,
  tiktokCommentsSchema,
  tiktokSearchSchema,
  tiktokTranscriptSchema,
  tiktokVideoSchema,
  youtubeCommentsSchema,
  youtubeSearchSchema,
  youtubeTranscriptSchema,
  youtubeVideoSchema,
  type TikTokAweme,
} from "./schemas";

export const SCRAPECREATORS_API_BASE_URL = "https://api.scrapecreators.com";

/** TikTok's per-post comment setting value meaning "no one can comment". TODO(assumption), see schemas.ts. */
const TIKTOK_COMMENTS_OFF = 3;

const CAPABILITIES: ProviderCapabilities = {
  youtube: { search: true, video: true, comments: true, transcript: true },
  tiktok: { search: true, video: true, comments: true, transcript: true },
};

export interface ScrapeCreatorsClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * VideoProvider backed by ScrapeCreators (YouTube + TikTok). Like the YouTube
 * client it does no caching or credit accounting; those live a layer up.
 */
export function createScrapeCreatorsClient(options: ScrapeCreatorsClientOptions): VideoProvider {
  const { apiKey, baseUrl = SCRAPECREATORS_API_BASE_URL, timeoutMs = 15_000 } = options;
  // Resolved per call so MSW (installed after construction) still intercepts.
  const fetchImpl: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);

  /**
   * The single boundary with ScrapeCreators: every response passes through
   * here and is validated with Zod before anything else can touch it.
   */
  async function request<S extends z.ZodType>(
    path: string,
    params: Record<string, string>,
    schema: S,
  ): Promise<z.output<S>> {
    const url = new URL(path, baseUrl);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const label = `ScrapeCreators ${path}`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        // The key goes in a header, never the URL, so it can't leak into logs or error messages.
        headers: { Accept: "application/json", "x-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      throw new UpstreamError(timedOut ? `${label} timed out` : `${label} request failed`, {
        cause,
      });
    }

    if (!response.ok) throw await toProviderError(label, response);

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new UpstreamError(`${label} returned invalid JSON`, { status: response.status, cause });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UpstreamError(`${label} returned an unexpected response shape`, {
        status: response.status,
        reason: "invalid_response",
        cause: parsed.error,
      });
    }
    const data = parsed.data as { success?: boolean };
    if (data.success === false) {
      throw new UpstreamError(`${label} reported success: false`, { status: response.status });
    }
    return parsed.data;
  }

  return {
    name: "scrapecreators",
    capabilities: CAPABILITIES,

    async search(platform, query) {
      if (platform === "youtube") {
        const data = await request("/v1/youtube/search", { query }, youtubeSearchSchema);
        // Creators care about Shorts too, so both lists are results.
        return [...(data.videos ?? []), ...(data.shorts ?? [])].map((item) => ({
          id: item.id,
          platform,
          url: canonicalVideoUrl({ platform, id: item.id }),
          title: decodeHtmlEntities(item.title),
          description: "",
          channelTitle: item.channel?.title ?? "",
          publishedAt: item.publishedTime ?? null,
          thumbnailUrl: item.thumbnail ?? null,
        }));
      }
      const data = await request("/v1/tiktok/search/keyword", { query }, tiktokSearchSchema);
      // TikTok "may return duplicate results" (docs), so dedupe by ID.
      const unique = new Map((data.search_item_list ?? []).map((item) => [item.aweme_id, item]));
      return [...unique.values()].map(tiktokSummary);
    },

    async getVideo(ref) {
      const url = canonicalVideoUrl(ref);
      if (ref.platform === "youtube") {
        const data = await request("/v1/youtube/video", { url }, youtubeVideoSchema);
        return {
          id: data.id,
          platform: "youtube",
          url,
          title: data.title,
          description: data.description ?? "",
          channelTitle: data.channel?.title ?? "",
          publishedAt: data.publishDate ?? null,
          thumbnailUrl: data.thumbnail ?? null,
          duration: data.durationMs == null ? null : msToIsoDuration(data.durationMs),
          viewCount: data.viewCountInt ?? null,
          likeCount: data.likeCountInt ?? null,
          commentCount: data.commentCountInt ?? null,
          commentsDisabled: null, // not exposed by this endpoint
        } satisfies VideoDetails;
      }
      const { aweme_detail: post } = await request("/v2/tiktok/video", { url }, tiktokVideoSchema);
      return {
        ...tiktokSummary(post),
        duration: post.video?.duration == null ? null : msToIsoDuration(post.video.duration),
        viewCount: post.statistics?.play_count ?? null,
        likeCount: post.statistics?.digg_count ?? null,
        commentCount: post.statistics?.comment_count ?? null,
        commentsDisabled:
          post.item_comment_settings == null
            ? null
            : post.item_comment_settings === TIKTOK_COMMENTS_OFF,
      } satisfies VideoDetails;
    },

    async getComments(ref) {
      const url = canonicalVideoUrl(ref);
      if (ref.platform === "youtube") {
        const data = await request(
          "/v1/youtube/video/comments",
          { url, order: "top" },
          youtubeCommentsSchema,
        );
        if (data.commentsDisabled || data.comments_disabled)
          return { comments: [], disabled: true };
        return {
          disabled: false,
          comments: (data.comments ?? []).map((comment) => ({
            id: comment.id,
            authorName: comment.author?.name ?? "Unknown",
            authorAvatarUrl: comment.author?.avatarUrl ?? null,
            text: comment.content,
            likeCount: comment.engagement?.likes ?? 0,
            replyCount: comment.engagement?.replies ?? 0,
            publishedAt: comment.publishedTime ?? null,
          })),
        } satisfies CommentsResult;
      }
      const data = await request("/v1/tiktok/video/comments", { url }, tiktokCommentsSchema);
      return {
        disabled: false,
        comments: (data.comments ?? []).map((comment, index) => ({
          // Stable fallback when `cid` is missing: same post + time + position.
          id: comment.cid ?? `${ref.id}-${comment.create_time ?? 0}-${index}`,
          authorName: comment.user?.nickname || comment.user?.unique_id || "Unknown",
          authorAvatarUrl: comment.user?.avatar_thumb?.url_list[0] ?? null,
          text: comment.text,
          likeCount: comment.digg_count ?? 0,
          replyCount: comment.reply_comment_total ?? 0,
          publishedAt: unixToIso(comment.create_time),
        })),
      } satisfies CommentsResult;
    },

    async getTranscript(ref) {
      const url = canonicalVideoUrl(ref);
      if (ref.platform === "youtube") {
        const data = await request(
          "/v1/youtube/video/transcript",
          { url },
          youtubeTranscriptSchema,
        );
        const text = data.transcript_only_text?.trim();
        if (!text) return NO_TRANSCRIPT;
        return {
          available: true,
          text,
          language: data.language ?? null,
          segments: (data.transcript ?? []).map((s) => ({
            startMs: s.startMs,
            endMs: s.endMs ?? null,
            text: s.text,
          })),
        } satisfies TranscriptResult;
      }
      // No AI fallback: it costs 10 extra ScrapeCreators credits and only covers videos up to
      // 2 minutes. Existing captions work for any length; no captions is a normal answer.
      const data = await request("/v1/tiktok/video/transcript", { url }, tiktokTranscriptSchema);
      const segments = parseWebVtt(data.transcript ?? "");
      if (segments.length === 0) return NO_TRANSCRIPT;
      return {
        available: true,
        text: segments.map((s) => s.text).join(" "),
        language: null,
        segments,
      } satisfies TranscriptResult;
    },
  };
}

const NO_TRANSCRIPT: TranscriptResult = { available: false, reason: "no_captions" };

function tiktokSummary(post: TikTokAweme): VideoSummary {
  const platform: Platform = "tiktok";
  const ref: VideoRef = { platform, id: post.aweme_id };
  const caption = post.desc?.trim() ?? "";
  return {
    id: post.aweme_id,
    platform,
    url: post.url ?? canonicalVideoUrl(ref),
    // TikTok posts have a caption, not a title.
    title: caption || "Untitled TikTok",
    description: caption,
    channelTitle: post.author?.nickname || post.author?.unique_id || "",
    publishedAt: unixToIso(post.create_time),
    thumbnailUrl: post.video?.cover?.url_list[0] ?? null,
  };
}

async function toProviderError(label: string, response: Response) {
  const { status } = response;
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
  const detail = body.success ? (body.data.message ?? body.data.error) : undefined;
  const suffix = detail ? `: ${detail}` : "";

  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new RateLimitError(`${label} rate limited${suffix}`, {
      status,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  if (status === 404) return new NotFoundError(`${label} not found${suffix}`, { status });
  // 401/403: bad or missing API key. 402: our ScrapeCreators account is out of credits.
  // Both are our problem, not the user's, so they surface as a generic upstream error.
  const reason =
    status === 401 || status === 403 ? "auth" : status === 402 ? "out_of_credits" : undefined;
  return new UpstreamError(`${label} failed with HTTP ${status}${suffix}`, { status, reason });
}
