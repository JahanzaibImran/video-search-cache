import { AppError } from "@/lib/errors";

interface YouTubeErrorDetails {
  /** HTTP status from YouTube, when there was a response at all. */
  status?: number;
  /** YouTube's machine-readable reason, e.g. "quotaExceeded" or "commentsDisabled". */
  reason?: string;
  cause?: unknown;
}

export abstract class YouTubeError extends AppError {
  readonly status?: number;
  readonly reason?: string;

  constructor(message: string, details: YouTubeErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.status = details.status;
    this.reason = details.reason;
  }
}

/** Quota exhausted (403 quotaExceeded and friends) or throttled (429). */
export class RateLimitError extends YouTubeError {
  readonly code = "UPSTREAM_RATE_LIMITED";
  readonly retryAfterSeconds?: number;

  constructor(message: string, details: YouTubeErrorDetails & { retryAfterSeconds?: number } = {}) {
    super(message, details);
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

/** The video (or its comments) doesn't exist or isn't public. */
export class NotFoundError extends YouTubeError {
  readonly code = "NOT_FOUND";
}

/** Anything else: 5xx, network failure, timeout, or a response that failed validation. */
export class UpstreamError extends YouTubeError {
  readonly code = "UPSTREAM_ERROR";
}
