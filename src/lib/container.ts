import { createCachedFetch, InMemoryCacheStore } from "@/lib/cache";
import { loadConfig, type AppConfig } from "@/lib/config";
import { InMemoryCreditLedger, type CreditLedger } from "@/lib/credits";
import { ConfigError } from "@/lib/errors";
import { createVideoService, type VideoService } from "@/lib/services/video-service";
import { createYouTubeClient } from "@/lib/youtube";

/**
 * Composition root: the one place concrete implementations are chosen.
 * Swapping in Redis or Postgres means changing this file and nothing else.
 */
export interface Container {
  config: AppConfig;
  ledger: CreditLedger;
  /** `null` until YOUTUBE_API_KEY is configured. */
  videoService: VideoService | null;
}

function createContainer(): Container {
  const config = loadConfig();
  const ledger = new InMemoryCreditLedger({ limit: config.creditLimit });
  const cache = createCachedFetch(new InMemoryCacheStore({ maxEntries: 5_000 }));

  const videoService = config.youtubeApiKey
    ? createVideoService({
        youtube: createYouTubeClient({ apiKey: config.youtubeApiKey }),
        ledger,
        cache,
      })
    : null;

  return { config, ledger, videoService };
}

// Kept on globalThis so in-memory state survives Next.js dev-mode module reloads.
const globalStore = globalThis as typeof globalThis & { __videoSearchContainer?: Container };

export function getContainer(): Container {
  globalStore.__videoSearchContainer ??= createContainer();
  return globalStore.__videoSearchContainer;
}

/** Returns the video service, or throws ConfigError when the API key is missing. */
export function getVideoService(): VideoService {
  const { videoService } = getContainer();
  if (!videoService) {
    throw new ConfigError(
      "YOUTUBE_API_KEY is not set. Copy .env.example to .env.local and add a key.",
    );
  }
  return videoService;
}

/** Test helper: drop all state so the next `getContainer()` re-reads env. */
export function resetContainer(): void {
  delete globalStore.__videoSearchContainer;
}
