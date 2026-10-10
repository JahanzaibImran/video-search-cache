/**
 * The HTTP contract between route handlers and the browser. Both sides import
 * these types, so a change to a response shape is a compile error on both ends.
 */
import type { CacheSource } from "@/lib/cache";
import type { CreditUsage } from "@/lib/credits";
import type {
  CommentsResult,
  Platform,
  TranscriptResult,
  VideoDetails,
  VideoRef,
  VideoSummary,
} from "@/lib/providers/types";

export type {
  CommentsResult,
  CreditUsage,
  Platform,
  TranscriptResult,
  VideoDetails,
  VideoRef,
  VideoSummary,
};
export type { VideoComment } from "@/lib/providers/types";

export interface CacheMeta {
  cacheKey: string;
  source: CacheSource;
  /** True when this response did not trigger an upstream call (so it cost nothing). */
  cached: boolean;
  /** Credits this request was actually charged. The UI shows this rather than assuming a price. */
  creditsCharged: number;
  /** ISO timestamp of the upstream fetch that produced the data. */
  fetchedAt: string;
}

export interface SearchResponse {
  query: string;
  platform: Platform;
  results: VideoSummary[];
  meta: CacheMeta;
  credits: CreditUsage;
}

/**
 * Comments can fail on their own (rate limit, out of credits, provider error)
 * without hiding video details that loaded fine. So the comments slot is
 * either data or an error, and the UI can tell three states apart:
 * - `data.disabled: true`        -> comments are turned off (free)
 * - `data.comments: []`          -> no comments yet (charged: a real answer)
 * - `error`                      -> the fetch failed (free: refunded)
 */
export type CommentsSlot = { data: CommentsResult; meta: CacheMeta } | { error: ApiError };

export interface VideoCommentsResponse {
  video: { data: VideoDetails; meta: CacheMeta };
  comments: CommentsSlot;
  credits: CreditUsage;
}

export interface TranscriptResponse {
  transcript: { data: TranscriptResult; meta: CacheMeta };
  credits: CreditUsage;
}

/** GET /api/resolve: a pasted link turned into a video reference. Free. */
export interface ResolveResponse {
  ref: VideoRef;
}

export interface CreditsResponse {
  credits: CreditUsage;
}

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "CREDIT_LIMIT_REACHED"
  | "NOT_FOUND"
  | "UNSUPPORTED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NOT_CONFIGURED"
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
  /** Included whenever the user's balance is known, so the UI can stay in sync. */
  credits?: CreditUsage;
}
