import { setupServer } from "msw/node";
import { youtubeHandlers } from "./handlers";
import { scrapeCreatorsHandlers } from "./scrapecreators-handlers";

/** Shared MSW server. Tests override behaviour per-case with `server.use(...)`. */
export const server = setupServer(...youtubeHandlers, ...scrapeCreatorsHandlers);
