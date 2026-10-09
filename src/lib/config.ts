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
  /** Captions almost never change once published. */
  transcript: 24 * HOUR,
} as const;

export const VIDEO_PROVIDERS = ["youtube", "scrapecreators"] as const;
export type VideoProviderName = (typeof VIDEO_PROVIDERS)[number];

/** Treat `FOO=` (present but empty) the same as unset. */
const emptyAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  /** Which backend serves video data. Defaults to the official YouTube Data API. */
  VIDEO_PROVIDER: z.preprocess(
    (value) => (typeof value === "string" ? emptyAsUndefined(value.trim().toLowerCase()) : value),
    z.enum(VIDEO_PROVIDERS).default("youtube"),
  ),
  YOUTUBE_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().optional()),
  SCRAPECREATORS_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().optional()),
  CREDIT_LIMIT: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().nonnegative().default(DEFAULT_CREDIT_LIMIT),
  ),
  /** Optional overrides, e.g. to point at a mock server for local e2e runs. */
  YOUTUBE_API_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  SCRAPECREATORS_API_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
});

export interface AppConfig {
  provider: VideoProviderName;
  /** `null` when not configured; the UI shows setup instructions instead of failing. */
  youtubeApiKey: string | null;
  scrapeCreatorsApiKey: string | null;
  creditLimit: number;
  youtubeApiBaseUrl?: string;
  scrapeCreatorsApiBaseUrl?: string;
}

/** The env var holding the selected provider's key, for setup messages. */
export const API_KEY_ENV: Record<VideoProviderName, string> = {
  youtube: "YOUTUBE_API_KEY",
  scrapecreators: "SCRAPECREATORS_API_KEY",
};

/** The selected provider's API key, or null when it hasn't been set. */
export function selectedApiKey(config: AppConfig): string | null {
  return config.provider === "youtube" ? config.youtubeApiKey : config.scrapeCreatorsApiKey;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ConfigError(`Invalid environment configuration: ${fields}`);
  }
  return {
    provider: parsed.data.VIDEO_PROVIDER,
    youtubeApiKey: parsed.data.YOUTUBE_API_KEY ?? null,
    scrapeCreatorsApiKey: parsed.data.SCRAPECREATORS_API_KEY ?? null,
    creditLimit: parsed.data.CREDIT_LIMIT,
    youtubeApiBaseUrl: parsed.data.YOUTUBE_API_BASE_URL,
    scrapeCreatorsApiBaseUrl: parsed.data.SCRAPECREATORS_API_BASE_URL,
  };
}
