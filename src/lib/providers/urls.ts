import type { Platform, VideoRef } from "./types";

/**
 * Turns any URL a user might paste into a `VideoRef`, so every spelling of the
 * same video shares one cache key ({platform}:{type}:{id}) and is paid for once.
 *
 * Pure and dependency-free: runs in the browser (instant feedback) and on the
 * server (the authority). TikTok short links (vm.tiktok.com/...) can't be
 * decoded offline; see `isTikTokShortLink` and /api/resolve.
 */

/** YouTube IDs: exactly 11 of [A-Za-z0-9_-]. Case-sensitive, never lowercased. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** TikTok post IDs are numeric (19 digits today); allow some headroom either way. */
const TIKTOK_ID = /^\d{15,25}$/;

export const VIDEO_ID_PATTERNS: Record<Platform, RegExp> = {
  youtube: YOUTUBE_ID,
  tiktok: TIKTOK_ID,
};

export function isValidVideoId(platform: Platform, id: string): boolean {
  return VIDEO_ID_PATTERNS[platform].test(id);
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

export function parseVideoUrl(input: string): VideoRef | null {
  const url = toUrl(input);
  if (!url) return null;
  const host = stripSubdomain(url.hostname.toLowerCase());
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(segments[0]);

  if (YOUTUBE_HOSTS.has(host)) {
    // youtube.com/watch?v=ID (any extra params like &t=42s or &list=... are ignored)
    if (segments[0] === "watch") return youtube(url.searchParams.get("v"));
    // youtube.com/shorts/ID, /embed/ID, /live/ID, /v/ID
    if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) return youtube(segments[1]);
    return null;
  }

  if (host === "tiktok.com") {
    // tiktok.com/@user/video/ID and photo posts tiktok.com/@user/photo/ID
    if (segments[0]?.startsWith("@") && (segments[1] === "video" || segments[1] === "photo")) {
      return tiktok(segments[2]);
    }
    // m.tiktok.com/v/ID.html (old mobile share links)
    if (segments[0] === "v") return tiktok(segments[1]?.replace(/\.html$/, ""));
    // tiktok.com/embed/v2/ID and tiktok.com/embed/ID
    if (segments[0] === "embed") return tiktok(segments[1] === "v2" ? segments[2] : segments[1]);
    return null;
  }

  return null;
}

/** vm.tiktok.com/XXXX, vt.tiktok.com/XXXX and tiktok.com/t/XXXX only redirect to the real URL. */
export function isTikTokShortLink(input: string): boolean {
  const url = toUrl(input);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (TIKTOK_SHORT_HOSTS.has(host)) return url.pathname.length > 1;
  return stripSubdomain(host) === "tiktok.com" && /^\/t\/[^/]+/.test(url.pathname);
}

/** True when the input looks like a link rather than a search phrase. */
export function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  return (
    /^https?:\/\//i.test(value) ||
    /^(www\.|m\.|vm\.|vt\.)?(youtube\.com|youtu\.be|tiktok\.com)\//i.test(value)
  );
}

/** The canonical watch URL we send to providers and show to users. */
export function canonicalVideoUrl({ platform, id }: VideoRef): string {
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  // TODO(assumption): TikTok resolves posts by numeric ID and ignores the handle,
  // so an empty handle works when we don't know the author. Verify with one live call.
  return `https://www.tiktok.com/@/video/${id}`;
}

function youtube(id: string | null | undefined): VideoRef | null {
  return id && YOUTUBE_ID.test(id) ? { platform: "youtube", id } : null;
}

function tiktok(id: string | null | undefined): VideoRef | null {
  return id && TIKTOK_ID.test(id) ? { platform: "tiktok", id } : null;
}

function toUrl(input: string): URL | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** www.youtube.com, m.youtube.com, music.youtube.com -> youtube.com (same for TikTok). */
function stripSubdomain(host: string): string {
  return host.replace(/^(www|m|music)\./, "");
}
