import { http, HttpResponse, type RequestHandler } from "msw";
import { YOUTUBE_API_BASE_URL } from "@/lib/youtube/client";
import {
  COMMENTS_DISABLED_VIDEO_ID,
  MISSING_VIDEO_ID,
  commentThreadsListResponse,
  searchListResponse,
  videosListResponse,
  youtubeErrorBody,
} from "../fixtures";

export const youtubeUrl = (endpoint: "search" | "videos" | "commentThreads") =>
  `${YOUTUBE_API_BASE_URL}/${endpoint}`;

/** How many times each endpoint was hit. Reset after every test in `setup.ts`. */
export const youtubeCalls = {
  search: 0,
  videos: 0,
  commentThreads: 0,
  get total() {
    return this.search + this.videos + this.commentThreads;
  },
  reset() {
    this.search = 0;
    this.videos = 0;
    this.commentThreads = 0;
  },
};

/** Default happy-path handlers for the YouTube Data API. */
export const youtubeHandlers: RequestHandler[] = [
  http.get(youtubeUrl("search"), ({ request }) => {
    youtubeCalls.search++;
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return HttpResponse.json(searchListResponse(query));
  }),

  http.get(youtubeUrl("videos"), ({ request }) => {
    youtubeCalls.videos++;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (id === MISSING_VIDEO_ID) return HttpResponse.json({ ...videosListResponse(id), items: [] });
    return HttpResponse.json(videosListResponse(id));
  }),

  http.get(youtubeUrl("commentThreads"), ({ request }) => {
    youtubeCalls.commentThreads++;
    const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
    if (videoId === COMMENTS_DISABLED_VIDEO_ID) {
      return HttpResponse.json(youtubeErrorBody(403, "commentsDisabled"), { status: 403 });
    }
    if (videoId === MISSING_VIDEO_ID) {
      return HttpResponse.json(youtubeErrorBody(404, "videoNotFound"), { status: 404 });
    }
    return HttpResponse.json(commentThreadsListResponse(videoId));
  }),
];
