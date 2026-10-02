/**
 * Raw YouTube Data API v3 payloads (trimmed to realistic size), used by MSW
 * handlers and tests. Shapes follow the public API reference.
 */

export const VIDEO_ID = "vid00000001";
export const OTHER_VIDEO_ID = "vid00000002";
export const COMMENTS_DISABLED_VIDEO_ID = "vidNoComms1";
export const MISSING_VIDEO_ID = "vidMissing1";

const snippet = (n: number, title: string) => ({
  publishedAt: `2024-0${n}-15T12:00:00Z`,
  channelId: `UCchannel${n}`,
  title,
  description: `Description for video ${n}`,
  thumbnails: {
    default: { url: `https://i.ytimg.com/vi/vid0000000${n}/default.jpg`, width: 120, height: 90 },
    medium: { url: `https://i.ytimg.com/vi/vid0000000${n}/mqdefault.jpg`, width: 320, height: 180 },
    high: { url: `https://i.ytimg.com/vi/vid0000000${n}/hqdefault.jpg`, width: 480, height: 360 },
  },
  channelTitle: `Channel ${n}`,
  liveBroadcastContent: "none",
});

export function searchListResponse(query = "react hooks") {
  return {
    kind: "youtube#searchListResponse",
    etag: "etag-search",
    regionCode: "US",
    pageInfo: { totalResults: 2, resultsPerPage: 12 },
    items: [
      {
        kind: "youtube#searchResult",
        etag: "etag-1",
        id: { kind: "youtube#video", videoId: VIDEO_ID },
        snippet: snippet(1, `Learn ${query} &amp; more in 10 minutes`),
      },
      {
        kind: "youtube#searchResult",
        etag: "etag-2",
        id: { kind: "youtube#video", videoId: OTHER_VIDEO_ID },
        snippet: snippet(2, "Don&#39;t make these mistakes"),
      },
    ],
  };
}

export function videosListResponse(videoId = VIDEO_ID) {
  return {
    kind: "youtube#videoListResponse",
    etag: "etag-videos",
    pageInfo: { totalResults: 1, resultsPerPage: 1 },
    items: [
      {
        kind: "youtube#video",
        etag: "etag-v1",
        id: videoId,
        snippet: { ...snippet(1, "Learn React Hooks & more in 10 minutes"), tags: ["react"] },
        contentDetails: { duration: "PT10M3S", dimension: "2d", definition: "hd" },
        statistics: { viewCount: "123456", likeCount: "7890", commentCount: "321" },
      },
    ],
  };
}

export function commentThreadsListResponse(videoId = VIDEO_ID) {
  const thread = (n: number, text: string, likeCount: number) => ({
    kind: "youtube#commentThread",
    etag: `etag-c${n}`,
    id: `thread-${n}`,
    snippet: {
      channelId: "UCchannel1",
      videoId,
      canReply: true,
      totalReplyCount: n,
      isPublic: true,
      topLevelComment: {
        kind: "youtube#comment",
        etag: `etag-tc${n}`,
        id: `thread-${n}`,
        snippet: {
          authorDisplayName: `@viewer${n}`,
          authorProfileImageUrl: `https://yt3.ggpht.com/avatar${n}`,
          textDisplay: text,
          textOriginal: text,
          likeCount,
          publishedAt: "2024-02-01T09:30:00Z",
          updatedAt: "2024-02-01T09:30:00Z",
        },
      },
    },
  });

  return {
    kind: "youtube#commentThreadListResponse",
    etag: "etag-threads",
    pageInfo: { totalResults: 2, resultsPerPage: 20 },
    items: [
      thread(1, "This finally made useEffect click for me.", 420),
      thread(2, "Great pace!", 12),
    ],
  };
}

/** Google's standard error envelope. */
export function youtubeErrorBody(code: number, reason: string, message = reason) {
  return {
    error: { code, message, errors: [{ message, domain: "youtube.quota", reason }] },
  };
}
