import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import type { ApiErrorCode, ApiErrorResponse, CacheMeta } from "@/lib/api/types";
import { getContainer } from "@/lib/container";
import { ACTION_LABELS, CreditLimitError, type CreditUsage } from "@/lib/credits";
import { AppError, InvalidInputError } from "@/lib/errors";
import { formatCredits } from "@/lib/format";
import type { ChargedResult } from "@/lib/services/video-service";
import { RateLimitError } from "@/lib/youtube";
import { USER_ID_COOKIE, resolveUser, type RequestUser } from "./user";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  CREDIT_LIMIT_REACHED: 402,
  NOT_FOUND: 404,
  UPSTREAM_RATE_LIMITED: 503,
  UPSTREAM_ERROR: 502,
  NOT_CONFIGURED: 503,
  INTERNAL_ERROR: 500,
};

/** Client-facing copy. Internal messages (endpoints, statuses) stay in server logs. */
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  INVALID_INPUT: "The request was invalid.",
  CREDIT_LIMIT_REACHED:
    "You don't have enough credits for that. Anything already cached is still free to view.",
  NOT_FOUND: "That video couldn't be found. It may be private or deleted.",
  UPSTREAM_RATE_LIMITED: "YouTube is rate-limiting us right now. Please try again shortly.",
  UPSTREAM_ERROR: "YouTube didn't respond as expected. Please try again.",
  NOT_CONFIGURED: "The server is missing its YouTube API key.",
  INTERNAL_ERROR: "Something went wrong on our side.",
};

/**
 * Wraps a route handler with user resolution, error-to-HTTP mapping and the
 * anonymous-user cookie, so each route only contains its own wiring.
 */
export async function handleApi<T>(
  request: NextRequest,
  handler: (user: RequestUser) => Promise<T>,
): Promise<NextResponse> {
  let user: RequestUser | undefined;
  let response: NextResponse;
  try {
    user = resolveUser(request);
    response = NextResponse.json(await handler(user));
  } catch (error) {
    response = await errorResponse(error, user?.userId);
  }

  response.headers.set("Cache-Control", "private, no-store"); // per-user credit data
  if (user?.isNew) {
    response.cookies.set(USER_ID_COOKIE, user.userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  return response;
}

/** Validates `input` against `schema`, throwing InvalidInputError (-> 400) on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
    );
    throw new InvalidInputError("Invalid request", issues);
  }
  return parsed.data;
}

export function toCacheMeta(result: ChargedResult<unknown>): CacheMeta {
  return {
    cacheKey: result.key,
    source: result.source,
    cached: result.source !== "upstream",
    creditsCharged: result.creditsCharged,
    fetchedAt: new Date(result.fetchedAt).toISOString(),
  };
}

async function errorResponse(error: unknown, userId?: string): Promise<NextResponse> {
  const code: ApiErrorCode = isKnownCode(error) ? error.code : "INTERNAL_ERROR";
  if (code === "INTERNAL_ERROR" || code === "UPSTREAM_ERROR") {
    console.error("[api]", error);
  }

  let message = MESSAGE_BY_CODE[code];
  if (error instanceof InvalidInputError && error.issues.length > 0) {
    message = `${message} ${error.issues.join("; ")}`;
  }
  if (error instanceof CreditLimitError && error.attempted) {
    const { action, cost } = error.attempted;
    message =
      `${ACTION_LABELS[action]} costs ${formatCredits(cost)} and you have ` +
      `${error.usage.remaining} left. Anything already cached is still free to view.`;
  }

  const body: ApiErrorResponse = { error: { code, message } };
  const credits = error instanceof CreditLimitError ? error.usage : await safeUsage(userId);
  if (credits) body.credits = credits;

  const response = NextResponse.json(body, { status: STATUS_BY_CODE[code] });
  if (error instanceof RateLimitError && error.retryAfterSeconds) {
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return response;
}

function isKnownCode(error: unknown): error is AppError & { code: ApiErrorCode } {
  return error instanceof AppError && error.code in STATUS_BY_CODE;
}

async function safeUsage(userId?: string): Promise<CreditUsage | undefined> {
  if (!userId) return undefined;
  try {
    return await getContainer().ledger.getUsage(userId);
  } catch {
    return undefined; // e.g. invalid config; the error response still goes out
  }
}
