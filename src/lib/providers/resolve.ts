import { InvalidInputError } from "@/lib/errors";
import { UpstreamError } from "./errors";
import type { VideoRef } from "./types";
import { isTikTokShortLink, parseVideoUrl } from "./urls";

const MAX_REDIRECTS = 3;
const ALLOWED_REDIRECT_HOST = /(^|\.)tiktok\.com$/i;

/**
 * Turns anything a user pastes into a `VideoRef`. Full URLs are parsed
 * offline. TikTok short links (vm.tiktok.com/XXXX) only reveal the video by
 * redirecting, so we follow the redirect ourselves: no provider call and no
 * credits. Only tiktok.com hosts are ever requested, so this can't be used to
 * make the server fetch arbitrary URLs (SSRF).
 */
export async function resolveVideoInput(
  input: string,
  fetchImpl: typeof fetch = (url, init) => globalThis.fetch(url, init),
): Promise<VideoRef> {
  const direct = parseVideoUrl(input);
  if (direct) return direct;
  if (!isTikTokShortLink(input)) {
    throw new InvalidInputError("That isn't a YouTube or TikTok video link");
  }

  let current = new URL(
    /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
  );
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
    } catch (cause) {
      throw new UpstreamError("TikTok short link could not be opened", { cause });
    }
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;

    const next = new URL(location, current);
    const ref = parseVideoUrl(next.toString());
    if (ref) return ref;
    if (!ALLOWED_REDIRECT_HOST.test(next.hostname)) break;
    current = next;
  }
  throw new InvalidInputError("That TikTok link doesn't point to a video");
}
