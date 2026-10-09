import { createCachedFetch, InMemoryCacheStore } from "@/lib/cache";
import { API_KEY_ENV, loadConfig, selectedApiKey, type AppConfig } from "@/lib/config";
import {
  createLedgerState,
  InMemoryCreditLedger,
  type CreditLedger,
  type LedgerState,
} from "@/lib/credits";
import { ConfigError } from "@/lib/errors";
import { createVideoService, type VideoService } from "@/lib/services/video-service";
import { createScrapeCreatorsClient } from "@/lib/providers/scrapecreators/client";
import type { VideoProvider } from "@/lib/providers/types";
import { createYouTubeClient, createYouTubeProvider } from "@/lib/youtube";

/**
 * Composition root: the one place concrete implementations are chosen.
 * Swapping in Redis or Postgres means changing this file and nothing else.
 */
export interface Container {
  config: AppConfig;
  ledger: CreditLedger;
  /** `null` until the selected provider's API key is configured. */
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

  const provider = createProvider(config);
  const videoService = provider ? createVideoService({ provider, ledger, cache }) : null;

  return { config, ledger, videoService };
}

/** VIDEO_PROVIDER=youtube|scrapecreators picks the implementation; nothing else knows which one runs. */
function createProvider(config: AppConfig): VideoProvider | null {
  const apiKey = selectedApiKey(config);
  if (!apiKey) return null;
  switch (config.provider) {
    case "youtube":
      return createYouTubeProvider(
        createYouTubeClient({ apiKey, baseUrl: config.youtubeApiBaseUrl }),
      );
    case "scrapecreators":
      return createScrapeCreatorsClient({ apiKey, baseUrl: config.scrapeCreatorsApiBaseUrl });
  }
}

// Module scope, not globalThis: when this module (or anything it imports, such
// as the ledger or the cost table) is edited, it is re-run and the container is
// rebuilt from the new code, on top of the persisted data above.
let container: Container | undefined;

export function getContainer(): Container {
  container ??= createContainer();
  return container;
}

/** Returns the video service, or throws ConfigError when the selected provider's key is missing. */
export function getVideoService(): VideoService {
  const { config, videoService } = getContainer();
  if (!videoService) {
    throw new ConfigError(
      `${API_KEY_ENV[config.provider]} is not set (VIDEO_PROVIDER=${config.provider}). ` +
        "Copy .env.example to .env.local and add a key.",
    );
  }
  return videoService;
}

/** Test helper: drop all state so the next `getContainer()` re-reads env. */
export function resetContainer(): void {
  container = undefined;
  delete globalStore.__videoSearchState;
}
