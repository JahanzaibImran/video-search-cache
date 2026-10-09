import { cacheKeys, normalizeQuery, type CachedFetch, type CachedResult } from "@/lib/cache";
import { CACHE_TTL_MS } from "@/lib/config";
import {
  CreditLimitError,
  withCredit,
  type CreditAction,
  type CreditLedger,
  type CreditUsage,
} from "@/lib/credits";
import { UnsupportedError } from "@/lib/providers/errors";
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

export interface VideoWithComments {
  video: ChargedResult<VideoDetails>;
  comments: ChargedResult<CommentsResult>;
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
        () => provider.getVideo(ref),
        ttl.video,
      );
      const comments = await cachedUpstream(
        userId,
        "comments",
        cacheKeys.comments(ref),
        () => provider.getComments(ref),
        ttl.comments,
      );
      return { video, comments };
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
