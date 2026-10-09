import { cacheKeys, normalizeQuery, type CachedFetch, type CachedResult } from "@/lib/cache";
import { CACHE_TTL_MS } from "@/lib/config";
import {
  CreditLimitError,
  withCredit,
  type CreditAction,
  type CreditLedger,
  type CreditUsage,
} from "@/lib/credits";
import { UnsupportedError, UpstreamError } from "@/lib/providers/errors";
import type {
  CommentsResult,
  Feature,
  Platform,
  TranscriptResult,
  VideoDetails,
  VideoProvider,
  VideoRef,
  VideoSummary,
} from "@/lib/providers/types";

export interface VideoServiceDeps {
  provider: VideoProvider;
  ledger: CreditLedger;
  cache: CachedFetch;
  ttlMs?: Partial<Record<keyof typeof CACHE_TTL_MS, number>>;
}

/** A cached result plus what this particular request was charged (0 for hits and joined fetches). */
export interface ChargedResult<T> extends CachedResult<T> {
  creditsCharged: number;
}

/** Comments either loaded (possibly empty, possibly turned off) or failed on their own. */
export type CommentsOutcome =
  { ok: true; result: ChargedResult<CommentsResult> } | { ok: false; error: unknown };

export interface VideoWithComments {
  video: ChargedResult<VideoDetails>;
  comments: CommentsOutcome;
}

export interface VideoService {
  readonly provider: VideoProvider;
  search(userId: string, platform: Platform, query: string): Promise<ChargedResult<VideoSummary[]>>;
  getVideoWithComments(userId: string, ref: VideoRef): Promise<VideoWithComments>;
  getTranscript(userId: string, ref: VideoRef): Promise<ChargedResult<TranscriptResult>>;
  getUsage(userId: string): Promise<CreditUsage>;
}

/**
 * Application logic: every provider call goes through the cache, and credits
 * are charged only when the cache actually has to call upstream. It depends on
 * the `VideoProvider` interface, never on a concrete API.
 */
/**
 * A schema can say a response is *well-formed*; only we can say it's the video
 * we asked for. Checked before caching, so a wrong answer is never stored
 * under this video's key (and served to everyone until it expires). Throwing
 * also refunds the charge.
 */
function assertSameVideo(ref: VideoRef, video: VideoDetails): VideoDetails {
  if (video.platform !== ref.platform || video.id !== ref.id) {
    throw new UpstreamError(
      `Provider returned ${video.platform}:${video.id} when asked for ${ref.platform}:${ref.id}`,
      { reason: "invalid_response" },
    );
  }
  return video;
}

export function createVideoService({
  provider,
  ledger,
  cache,
  ttlMs,
}: VideoServiceDeps): VideoService {
  const ttl = { ...CACHE_TTL_MS, ...ttlMs };

  /** Refuse unsupported requests up front: no charge, no ledger entry, no network call. */
  function requireCapability(platform: Platform, feature: Feature) {
    if (!provider.capabilities[platform][feature]) {
      throw new UnsupportedError(`Provider "${provider.name}" can't do ${feature} on ${platform}`);
    }
  }

  /**
   * The charge lives inside the fetcher, and `getOrFetch` runs the fetcher only
   * on a real miss and only for the one caller leading a deduplicated fetch.
   * So cache hits and joined in-flight requests are free by construction, and
   * a user who can't afford the call is stopped before any network call.
   */
  async function cachedUpstream<T>(
    userId: string,
    action: CreditAction,
    key: string,
    call: () => Promise<T>,
    ttlMs: number,
    billable?: (value: T) => boolean,
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
            { billable },
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

  /**
   * Three different "no comments shown" situations, kept apart on purpose:
   * - turned off: free. We know before calling (the video says so) or the
   *   provider tells us; either way the user got nothing to read.
   * - none yet:   charged. The call worked and "zero comments" is a real answer.
   * - failed:     free (refunded), and reported without hiding the video.
   */
  async function loadComments(
    userId: string,
    ref: VideoRef,
    video: ChargedResult<VideoDetails>,
  ): Promise<CommentsOutcome> {
    if (video.value.commentsDisabled === true) {
      // Derived from the (cached) video details: no upstream call, so it's
      // reported like a cache hit and costs nothing.
      return {
        ok: true,
        result: {
          key: cacheKeys.comments(ref),
          value: { comments: [], disabled: true },
          fetchedAt: video.fetchedAt,
          source: "cache",
          creditsCharged: 0,
        },
      };
    }
    try {
      const result = await cachedUpstream(
        userId,
        "comments",
        cacheKeys.comments(ref),
        () => provider.getComments(ref),
        ttl.comments,
        (comments) => !comments.disabled,
      );
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error };
    }
  }

  return {
    provider,

    async search(userId, platform, query) {
      requireCapability(platform, "search");
      const normalized = normalizeQuery(query);
      // Send the normalised query upstream too, so the cached payload matches its key exactly.
      return cachedUpstream(
        userId,
        "search",
        cacheKeys.search(platform, normalized),
        () => provider.search(platform, normalized),
        ttl.search,
      );
    },

    async getVideoWithComments(userId, ref) {
      requireCapability(ref.platform, "video");
      requireCapability(ref.platform, "comments");
      // Sequential on purpose: if the video doesn't exist, we don't spend a
      // second upstream call (and credits) discovering that its comments don't either.
      const video = await cachedUpstream(
        userId,
        "videoDetails",
        cacheKeys.video(ref),
        async () => assertSameVideo(ref, await provider.getVideo(ref)),
        ttl.video,
      );
      return { video, comments: await loadComments(userId, ref, video) };
    },

    async getTranscript(userId, ref) {
      requireCapability(ref.platform, "transcript");
      return cachedUpstream(
        userId,
        "transcript",
        cacheKeys.transcript(ref),
        () => provider.getTranscript(ref),
        ttl.transcript,
        // "No transcript" is a normal answer: cached so we don't ask again, but free.
        (result) => result.available,
      );
    },

    getUsage(userId) {
      return ledger.getUsage(userId);
    },
  };
}
