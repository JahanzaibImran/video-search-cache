/**
 * The HTTP contract between route handlers and the browser. Both sides import
 * these types, so a change to a response shape is a compile error on both ends.
 */
import type { CacheSource } from "@/lib/cache";
import type { CreditUsage } from "@/lib/credits";
import type { CommentsResult, VideoDetails, VideoSummary } from "@/lib/youtube";

export type { CreditUsage, CommentsResult, VideoDetails, VideoSummary };
export type { VideoComment } from "@/lib/youtube";

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
  results: VideoSummary[];
  meta: CacheMeta;
  credits: CreditUsage;
}

export interface VideoCommentsResponse {
  video: { data: VideoDetails; meta: CacheMeta };
  comments: { data: CommentsResult; meta: CacheMeta };
  credits: CreditUsage;
}

export interface CreditsResponse {
  credits: CreditUsage;
}

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "CREDIT_LIMIT_REACHED"
  | "NOT_FOUND"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NOT_CONFIGURED"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
  /** Included whenever the user's balance is known, so the UI can stay in sync. */
  credits?: CreditUsage;
}
