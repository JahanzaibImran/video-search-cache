import type { z } from "zod";
import { canonicalVideoUrl } from "@/lib/providers/urls";
import { NotFoundError, RateLimitError, UpstreamError } from "./errors";
import { decodeHtmlEntities } from "./html-entities";
import {
  apiErrorSchema,
  commentThreadsListSchema,
  searchListSchema,
  videosListSchema,
  type SearchListResponse,
} from "./schemas";
import type { CommentsResult, VideoDetails, VideoSummary } from "./types";

export const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

/** 403 reasons that mean "slow down / out of quota" rather than "you may not". */
const RATE_LIMIT_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

export interface YouTubeClient {
  searchVideos(query: string, options?: { maxResults?: number }): Promise<VideoSummary[]>;
  getVideo(videoId: string): Promise<VideoDetails>;
  getTopComments(videoId: string, options?: { maxResults?: number }): Promise<CommentsResult>;
}

export interface YouTubeClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Thin typed wrapper over the three YouTube Data API v3 endpoints we use.
 * It does no caching or credit accounting; those concerns live a layer up.
 */
export function createYouTubeClient(options: YouTubeClientOptions): YouTubeClient {
  const { apiKey, baseUrl = YOUTUBE_API_BASE_URL, timeoutMs = 8_000 } = options;
  // Resolved per call, not captured at construction, so fetch instrumentation
  // (tracing, MSW in tests) installed after the client is created still applies.
  const fetchImpl: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);

  async function request<S extends z.ZodType>(
    endpoint: string,
    params: Record<string, string>,
    schema: S,
  ): Promise<z.output<S>> {
    const url = new URL(`${baseUrl}/${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set("key", apiKey);

    // Error messages name the endpoint, never the URL, because the URL contains the API key.
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store", // caching is ours to manage, not Next's fetch cache
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      throw new UpstreamError(
        timedOut ? `YouTube ${endpoint} timed out` : `YouTube ${endpoint} request failed`,
        { cause },
      );
    }

    if (!response.ok) throw await toYouTubeError(endpoint, response);

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new UpstreamError(`YouTube ${endpoint} returned invalid JSON`, {
        status: response.status,
        reason: "invalid_json",
        cause,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UpstreamError(`YouTube ${endpoint} returned an unexpected response shape`, {
        status: response.status,
        reason: "invalid_response",
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return {
    async searchVideos(query, { maxResults = 12 } = {}) {
      const data = await request(
        "search",
        { part: "snippet", type: "video", q: query, maxResults: String(maxResults) },
        searchListSchema,
      );
      return data.items.map(toVideoSummary);
    },

    async getVideo(videoId) {
      const data = await request(
        "videos",
        { part: "snippet,statistics,contentDetails", id: videoId },
        videosListSchema,
      );
      const item = data.items[0];
      // videos.list answers 200 with an empty list for unknown or private IDs.
      if (!item) throw new NotFoundError(`Video ${videoId} not found`, { status: 200 });

      return {
        id: item.id,
        platform: "youtube",
        url: canonicalVideoUrl({ platform: "youtube", id: item.id }),
        title: item.snippet.title,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
        duration: item.contentDetails?.duration ?? null,
        viewCount: item.statistics?.viewCount ?? null,
        likeCount: item.statistics?.likeCount ?? null,
        commentCount: item.statistics?.commentCount ?? null,
        // The Data API only says so when comments are requested (403 commentsDisabled).
        commentsDisabled: null,
      };
    },

    async getTopComments(videoId, { maxResults = 20 } = {}) {
      try {
        const data = await request(
          "commentThreads",
          {
            part: "snippet",
            videoId,
            order: "relevance",
            textFormat: "plainText",
            maxResults: String(maxResults),
          },
          commentThreadsListSchema,
        );
        return {
          disabled: false,
          comments: data.items.map(({ id, snippet: thread }) => {
            const comment = thread.topLevelComment.snippet;
            return {
              id,
              authorName: comment.authorDisplayName,
              authorAvatarUrl: comment.authorProfileImageUrl ?? null,
              text: comment.textOriginal,
              likeCount: comment.likeCount,
              replyCount: thread.totalReplyCount,
              publishedAt: comment.publishedAt,
            };
          }),
        };
      } catch (error) {
        // Comments being turned off is a normal state for a video, not a failure.
        if (error instanceof UpstreamError && error.reason === "commentsDisabled") {
          return { comments: [], disabled: true };
        }
        throw error;
      }
    },
  };
}

function toVideoSummary(item: SearchListResponse["items"][number]): VideoSummary {
  return {
    id: item.id.videoId,
    platform: "youtube",
    url: canonicalVideoUrl({ platform: "youtube", id: item.id.videoId }),
    title: decodeHtmlEntities(item.snippet.title),
    description: decodeHtmlEntities(item.snippet.description),
    channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
  };
}

function pickThumbnail(thumbnails: SearchListResponse["items"][number]["snippet"]["thumbnails"]) {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

async function toYouTubeError(endpoint: string, response: Response) {
  const { status } = response;
  const body = apiErrorSchema.safeParse(await response.json().catch(() => null));
  const reason = body.success ? body.data.error.errors?.[0]?.reason : undefined;

  if (status === 429 || (status === 403 && reason && RATE_LIMIT_REASONS.has(reason))) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new RateLimitError(`YouTube ${endpoint} rate limit or quota exceeded`, {
      status,
      reason,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  if (status === 404) {
    return new NotFoundError(`YouTube ${endpoint} resource not found`, { status, reason });
  }
  return new UpstreamError(`YouTube ${endpoint} failed with HTTP ${status}`, { status, reason });
}
