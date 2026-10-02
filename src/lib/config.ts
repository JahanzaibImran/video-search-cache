import { z } from "zod";
import { DEFAULT_CREDIT_LIMIT } from "@/lib/credits";
import { ConfigError } from "@/lib/errors";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** How long each kind of upstream response stays fresh in the cache. */
export const CACHE_TTL_MS = {
  /** Search rankings drift, but not minute to minute. */
  search: 30 * MINUTE,
  /** Titles/thumbnails rarely change; view counts going a little stale is fine. */
  video: 6 * HOUR,
  /** New top comments surface fairly quickly on popular videos. */
  comments: 15 * MINUTE,
} as const;

/** Treat `FOO=` (present but empty) the same as unset. */
const emptyAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  YOUTUBE_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().optional()),
  CREDIT_LIMIT: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().nonnegative().default(DEFAULT_CREDIT_LIMIT),
  ),
  /** Optional override, e.g. to point at a mock server for local e2e runs. */
  YOUTUBE_API_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
});

export interface AppConfig {
  /** `null` when not configured; the UI shows setup instructions instead of failing. */
  youtubeApiKey: string | null;
  creditLimit: number;
  youtubeApiBaseUrl?: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ConfigError(`Invalid environment configuration: ${fields}`);
  }
  return {
    youtubeApiKey: parsed.data.YOUTUBE_API_KEY ?? null,
    creditLimit: parsed.data.CREDIT_LIMIT,
    youtubeApiBaseUrl: parsed.data.YOUTUBE_API_BASE_URL,
  };
}
