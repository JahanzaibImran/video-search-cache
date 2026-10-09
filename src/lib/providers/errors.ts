import { AppError } from "@/lib/errors";

interface ProviderErrorDetails {
  /** HTTP status from the provider, when there was a response at all. */
  status?: number;
  /** The provider's machine-readable reason, e.g. "quotaExceeded" or "commentsDisabled". */
  reason?: string;
  cause?: unknown;
}

/**
 * Base class for anything that went wrong talking to a video provider.
 * `message` is for server logs (names the endpoint, never the API key);
 * clients get fixed, friendly copy keyed by `code` (see http/handler.ts).
 */
export abstract class ProviderError extends AppError {
  readonly status?: number;
  readonly reason?: string;

  constructor(message: string, details: ProviderErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.status = details.status;
    this.reason = details.reason;
  }
}

/** Quota exhausted or throttled (429, YouTube's 403 quotaExceeded, ...). */
export class RateLimitError extends ProviderError {
  readonly code = "UPSTREAM_RATE_LIMITED";
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    details: ProviderErrorDetails & { retryAfterSeconds?: number } = {},
  ) {
    super(message, details);
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

/** The video (or its comments) doesn't exist or isn't public. */
export class NotFoundError extends ProviderError {
  readonly code = "NOT_FOUND";
}

/** Anything else: 5xx, network failure, timeout, or a response that failed validation. */
export class UpstreamError extends ProviderError {
  readonly code = "UPSTREAM_ERROR";
}

/** The configured provider can't do this (e.g. TikTok search on the YouTube Data API). */
export class UnsupportedError extends AppError {
  readonly code = "UNSUPPORTED";
}
