import { createCachedFetch, InMemoryCacheStore } from "@/lib/cache";
import { loadConfig, type AppConfig } from "@/lib/config";
import {
  createLedgerState,
  InMemoryCreditLedger,
  type CreditLedger,
  type LedgerState,
} from "@/lib/credits";
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

/**
 * Plain data that must outlive a dev hot reload: cached responses and the
 * credit history. Only data lives here, never objects with behaviour.
 *
 * Why: Next.js re-runs edited modules in dev, but anything stored on
 * `globalThis` survives. We used to keep the whole container there, so after
 * editing the ledger the *old* ledger object (with the old prices) kept
 * serving requests until the dev server restarted.
 */
interface PersistentState {
  cacheStore: InMemoryCacheStore;
  ledgerState: LedgerState;
}

const globalStore = globalThis as typeof globalThis & { __videoSearchState?: PersistentState };

function persistentState(): PersistentState {
  globalStore.__videoSearchState ??= {
    cacheStore: new InMemoryCacheStore({ maxEntries: 5_000 }),
    ledgerState: createLedgerState(),
  };
  return globalStore.__videoSearchState;
}

function createContainer(): Container {
  const config = loadConfig();
  const { cacheStore, ledgerState } = persistentState();
  const ledger = new InMemoryCreditLedger({ limit: config.creditLimit, state: ledgerState });
  const cache = createCachedFetch(cacheStore);

  const videoService = config.youtubeApiKey
    ? createVideoService({
        youtube: createYouTubeClient({
          apiKey: config.youtubeApiKey,
          baseUrl: config.youtubeApiBaseUrl,
        }),
        ledger,
        cache,
      })
    : null;

  return { config, ledger, videoService };
}

// Module scope, not globalThis: when this module (or anything it imports, such
// as the ledger or the cost table) is edited, it is re-run and the container is
// rebuilt from the new code, on top of the persisted data above.
let container: Container | undefined;

export function getContainer(): Container {
  container ??= createContainer();
  return container;
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
  container = undefined;
  delete globalStore.__videoSearchState;
}
