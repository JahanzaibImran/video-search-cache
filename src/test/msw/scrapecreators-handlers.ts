import { http, HttpResponse, type RequestHandler } from "msw";
import { SCRAPECREATORS_API_BASE_URL } from "@/lib/providers/scrapecreators/client";
import { parseVideoUrl } from "@/lib/providers/urls";
import {
  SC_YT_COMMENTS_OFF_ID,
  SC_YT_MISSING_ID,
  SC_YT_NO_CAPTIONS_ID,
  SC_YT_NO_COMMENTS_ID,
  TT_MISSING_ID,
  TT_NO_COMMENTS_ID,
  TT_NO_TRANSCRIPT_ID,
  scTiktokComments,
  scTiktokNoTranscript,
  scTiktokSearch,
  scTiktokTranscript,
  scTiktokVideo,
  scYoutubeComments,
  scYoutubeNoTranscript,
  scYoutubeSearch,
  scYoutubeTranscript,
  scYoutubeVideo,
} from "../scrapecreators-fixtures";

export const SC_TEST_API_KEY = "sc-test-key";

export const scUrl = (path: string) => `${SCRAPECREATORS_API_BASE_URL}${path}`;

/** Calls per endpoint path. Reset after every test in `setup.ts`. */
export const scCalls = {
  byPath: new Map<string, number>(),
  count(path: string) {
    return this.byPath.get(path) ?? 0;
  },
  get total() {
    return [...this.byPath.values()].reduce((sum, n) => sum + n, 0);
  },
  reset() {
    this.byPath.clear();
  },
};

/**
 * Wraps a fixture handler with what every ScrapeCreators call shares: the
 * call counter, a check that the API key is sent as a header, and URL parsing.
 */
function scGet(path: string, respond: (ctx: { id: string; params: URLSearchParams }) => Response) {
  return http.get(scUrl(path), ({ request }) => {
    scCalls.byPath.set(path, scCalls.count(path) + 1);
    if (request.headers.get("x-api-key") !== SC_TEST_API_KEY) {
      return HttpResponse.json({ success: false, message: "Invalid API key" }, { status: 401 });
    }
    const params = new URL(request.url).searchParams;
    const id = parseVideoUrl(params.get("url") ?? "")?.id ?? "";
    return respond({ id, params });
  });
}

const notFound = () =>
  HttpResponse.json({ success: false, message: "Video not found" }, { status: 404 });

/** Default happy-path handlers; special fixture IDs trigger the edge cases. */
export const scrapeCreatorsHandlers: RequestHandler[] = [
  scGet("/v1/youtube/search", ({ params }) =>
    HttpResponse.json(scYoutubeSearch(params.get("query") ?? "")),
  ),
  scGet("/v1/youtube/video", ({ id }) =>
    id === SC_YT_MISSING_ID ? notFound() : HttpResponse.json(scYoutubeVideo(id)),
  ),
  scGet("/v1/youtube/video/comments", ({ id }) => {
    if (id === SC_YT_MISSING_ID) return notFound();
    if (id === SC_YT_COMMENTS_OFF_ID) {
      return HttpResponse.json({
        success: true,
        credits_charged: 1,
        comments: [],
        commentsDisabled: true,
      });
    }
    if (id === SC_YT_NO_COMMENTS_ID) return HttpResponse.json({ success: true, comments: [] });
    return HttpResponse.json(scYoutubeComments());
  }),
  scGet("/v1/youtube/video/transcript", ({ id }) =>
    HttpResponse.json(
      id === SC_YT_NO_CAPTIONS_ID ? scYoutubeNoTranscript(id) : scYoutubeTranscript(id),
    ),
  ),
  scGet("/v1/tiktok/search/keyword", () => HttpResponse.json(scTiktokSearch())),
  scGet("/v2/tiktok/video", ({ id }) =>
    id === TT_MISSING_ID ? notFound() : HttpResponse.json(scTiktokVideo(id)),
  ),
  scGet("/v1/tiktok/video/comments", ({ id }) =>
    id === TT_NO_COMMENTS_ID
      ? HttpResponse.json({ success: true, comments: [], total: 0 })
      : HttpResponse.json(scTiktokComments(id)),
  ),
  scGet("/v1/tiktok/video/transcript", ({ id }) =>
    HttpResponse.json(
      id === TT_NO_TRANSCRIPT_ID ? scTiktokNoTranscript(id) : scTiktokTranscript(id),
    ),
  ),
];
