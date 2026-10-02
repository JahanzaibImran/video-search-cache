/**
 * Normalises a free-text search query so equivalent queries share one cache entry:
 * Unicode-normalised, trimmed, inner whitespace collapsed, lowercased.
 * "  React   Hooks " and "react hooks" both become "react hooks".
 */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The single source of truth for cache key shapes. Video IDs are case-sensitive
 * on YouTube, so they are used as-is; only free-text queries are normalised.
 */
export const cacheKeys = {
  video: (videoId: string) => `yt:video:${videoId}`,
  comments: (videoId: string) => `yt:comments:${videoId}`,
  search: (query: string) => `yt:search:${normalizeQuery(query)}`,
} as const;
