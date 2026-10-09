import { UnsupportedError } from "@/lib/providers/errors";
import type { ProviderCapabilities, VideoProvider } from "@/lib/providers/types";
import type { YouTubeClient } from "./client";

const NONE = { search: false, video: false, comments: false, transcript: false };

/**
 * The official YouTube Data API: YouTube only, and no transcripts (caption
 * downloads need OAuth as the video owner). The service checks these
 * capabilities before charging, so unsupported requests are refused for free.
 */
const CAPABILITIES: ProviderCapabilities = {
  youtube: { search: true, video: true, comments: true, transcript: false },
  tiktok: NONE,
};

/** Adapts the existing YouTube Data API client to the VideoProvider interface. */
export function createYouTubeProvider(client: YouTubeClient): VideoProvider {
  const youtubeOnly = (platform: string) => {
    if (platform !== "youtube") {
      throw new UnsupportedError(`The YouTube Data API provider can't serve ${platform}`);
    }
  };

  return {
    name: "youtube",
    capabilities: CAPABILITIES,
    search(platform, query) {
      youtubeOnly(platform);
      return client.searchVideos(query);
    },
    getVideo(ref) {
      youtubeOnly(ref.platform);
      return client.getVideo(ref.id);
    },
    getComments(ref) {
      youtubeOnly(ref.platform);
      return client.getTopComments(ref.id);
    },
    async getTranscript() {
      throw new UnsupportedError("The YouTube Data API provider doesn't support transcripts");
    },
  };
}
