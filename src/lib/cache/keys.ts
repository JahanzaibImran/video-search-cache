import type { Platform, VideoRef } from "@/lib/providers/types";

/**
 * Normalises a free-text search query so equivalent queries share one cache entry:
 * Unicode-normalised, trimmed, inner whitespace collapsed, lowercased.
 * "  React   Hooks " and "react hooks" both become "react hooks".
 */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The single source of truth for cache key shapes: `{platform}:{type}:{id}`.
 * The platform is part of every key, so YouTube and TikTok entries can never
 * collide. Video IDs are case-sensitive and used as-is; only free-text queries
 * are normalised. URLs are normalised to a `VideoRef` before they get here
 * (see providers/urls.ts), so every link form of a video maps to one key.
 */
export const cacheKeys = {
  search: (platform: Platform, query: string) => `${platform}:search:${normalizeQuery(query)}`,
  video: ({ platform, id }: VideoRef) => `${platform}:video:${id}`,
  comments: ({ platform, id }: VideoRef) => `${platform}:comments:${id}`,
  transcript: ({ platform, id }: VideoRef) => `${platform}:transcript:${id}`,
} as const;
