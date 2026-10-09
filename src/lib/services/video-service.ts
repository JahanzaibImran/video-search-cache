import { cacheKeys, normalizeQuery, type CachedFetch, type CachedResult } from "@/lib/cache";
import { CACHE_TTL_MS } from "@/lib/config";
import {
  CreditLimitError,
  withCredit,
  type CreditAction,
  type CreditLedger,
  type CreditUsage,
} from "@/lib/credits";
import type { CommentsResult, VideoDetails, VideoSummary, YouTubeClient } from "@/lib/youtube";

export interface VideoServiceDeps {
  youtube: YouTubeClient;
  ledger: CreditLedger;
  cache: CachedFetch;
  ttlMs?: Partial<Record<keyof typeof CACHE_TTL_MS, number>>;
}

/** A cached result plus what this particular request was charged (0 for hits and joined fetches). */
export interface ChargedResult<T> extends CachedResult<T> {
  creditsCharged: number;
}

export interface VideoWithComments {
  video: ChargedResult<VideoDetails>;
  comments: ChargedResult<CommentsResult>;
}

export interface VideoService {
  search(userId: string, query: string): Promise<ChargedResult<VideoSummary[]>>;
  getVideoWithComments(userId: string, videoId: string): Promise<VideoWithComments>;
  getUsage(userId: string): Promise<CreditUsage>;
}

/**
 * Application logic: every YouTube call goes through the cache, and a credit
 * is charged only when the cache actually has to call upstream.
 */
export function createVideoService({
  youtube,
  ledger,
  cache,
  ttlMs,
}: VideoServiceDeps): VideoService {
  const ttl = { ...CACHE_TTL_MS, ...ttlMs };

  /**
   * The charge lives inside the fetcher, and `getOrFetch` runs the fetcher only
   * on a real miss and only for the one caller leading a deduplicated fetch.
   * So cache hits and joined in-flight requests are free by construction, and
   * a user with no credits left is stopped before any network call.
   */
  async function cachedUpstream<T>(
    userId: string,
    action: CreditAction,
    key: string,
    call: () => Promise<T>,
    ttlMs: number,
  ): Promise<ChargedResult<T>> {
    // Set only when *this* request's fetcher ran and paid; the cache stores the
    // bare value, so a later hit can never claim a cost.
    let creditsCharged = 0;
    const attempt = async (): Promise<ChargedResult<T>> => {
      const result = await cache.getOrFetch(
        key,
        async () => {
          const { value, charged } = await withCredit(
            ledger,
            { userId, action, cacheKey: key },
            call,
          );
          creditsCharged = charged;
          return value;
        },
        ttlMs,
      );
      return { ...result, creditsCharged };
    };

    try {
      return await attempt();
    } catch (error) {
      // We joined an in-flight fetch led by a *different* user who was out of
      // credits. Their limit isn't ours, so retry and be judged on our own balance.
      if (error instanceof CreditLimitError && error.userId !== userId) return attempt();
      throw error;
    }
  }

  return {
    search(userId, query) {
      const normalized = normalizeQuery(query);
      // Send the normalised query upstream too, so the cached payload matches its key exactly.
      return cachedUpstream(
        userId,
        "search",
        cacheKeys.search(normalized),
        () => youtube.searchVideos(normalized),
        ttl.search,
      );
    },

    async getVideoWithComments(userId, videoId) {
      // Sequential on purpose: if the video doesn't exist, we don't spend a
      // second upstream call (and quota) discovering that its comments don't either.
      const video = await cachedUpstream(
        userId,
        "videoDetails",
        cacheKeys.video(videoId),
        () => youtube.getVideo(videoId),
        ttl.video,
      );
      const comments = await cachedUpstream(
        userId,
        "comments",
        cacheKeys.comments(videoId),
        () => youtube.getTopComments(videoId),
        ttl.comments,
      );
      return { video, comments };
    },

    getUsage(userId) {
      return ledger.getUsage(userId);
    },
  };
}
