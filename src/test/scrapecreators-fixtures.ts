/**
 * Recorded-style ScrapeCreators payloads for MSW handlers and tests.
 *
 * Copied from the response examples in the official OpenAPI files
 * (https://docs.scrapecreators.com/{path}/openapi.json, fetched 2026-10-10)
 * and trimmed. Extra fields we don't read (credits_remaining, badges, ...)
 * are kept on purpose: they prove unknown fields are tolerated and stripped.
 * IDs below are routed to specific behaviours by the handlers.
 */

export const SC_YT_VIDEO_ID = "Y2Ah_DFr8cw";
export const SC_YT_SHORT_ID = "uMNvF-lSCHg";
export const SC_YT_MISSING_ID = "missingVid1";
export const SC_YT_NO_CAPTIONS_ID = "noCaptions1";
export const SC_YT_COMMENTS_OFF_ID = "commentsOff";
export const SC_YT_NO_COMMENTS_ID = "noComments1";

export const TT_VIDEO_ID = "7517114944362499342";
export const TT_OTHER_ID = "7268287584244124971";
export const TT_COMMENTS_OFF_ID = "7000000000000000003";
export const TT_NO_COMMENTS_ID = "7000000000000000005";
export const TT_NO_TRANSCRIPT_ID = "7000000000000000004";
export const TT_MISSING_ID = "7000000000000000404";

const meta = { success: true, credits_remaining: 1000000, credits_charged: 1 };

export function scYoutubeSearch(query = "running") {
  return {
    ...meta,
    videos: [
      {
        type: "video",
        id: SC_YT_VIDEO_ID,
        url: `https://www.youtube.com/watch?v=${SC_YT_VIDEO_ID}`,
        title: `NF - RUNNING (Audio) &amp; ${query}`,
        thumbnail: `https://i.ytimg.com/vi/${SC_YT_VIDEO_ID}/hq720.jpg`,
        channel: { id: "UCoRR6OLuIZ2-5VxtnQIaN2w", title: "NFrealmusic", handle: "channel/x" },
        viewCountText: "14,860,541 views",
        viewCountInt: 14860541,
        publishedTimeText: "2 years ago",
        publishedTime: "2023-05-28T17:08:46.499Z",
        lengthText: "4:14",
        lengthSeconds: 254,
        badges: [],
      },
    ],
    channels: [],
    playlists: [],
    shorts: [
      {
        type: "short",
        id: SC_YT_SHORT_ID,
        url: `https://www.youtube.com/watch?v=${SC_YT_SHORT_ID}`,
        title: "LONG RUN ROUTINE #run #shorts",
        thumbnail: `https://i.ytimg.com/vi/${SC_YT_SHORT_ID}/hq720.jpg`,
        channel: { id: "UCGRdcRxpJWi5Q2oDCrMDUuQ", title: "Abby and Ryan", handle: "abbyandryan" },
        viewCountInt: 462705,
        publishedTimeText: "10 months ago",
        lengthSeconds: 44,
        badges: [],
      },
    ],
    shelves: [],
    lives: [],
    continuationToken: "EooDEg...",
  };
}

export function scYoutubeVideo(id = SC_YT_VIDEO_ID) {
  return {
    ...meta,
    id,
    thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${id}`,
    publishDate: "2019-02-22T03:19:54-08:00",
    type: "video",
    title: 'Inside the NBA: Chuck Trolls Jussie Smollett "Do not commit crimes with checks"',
    description: null,
    commentCountText: "358",
    commentCountInt: 358,
    likeCountText: "4043",
    likeCountInt: 4043,
    viewCountText: "372,864",
    viewCountInt: 372864,
    channel: { id: "UCWH3hing1Qb4LnkRfQdxsxQ", handle: "afroballer8906", title: "Afroballer" },
    chapters: [],
    keywords: [],
    genre: "People & Blogs",
    durationMs: 348000,
    durationFormatted: "00:05:48",
    isPaidPromotion: false,
  };
}

export function scYoutubeComments() {
  return {
    ...meta,
    comments: [
      {
        id: "UgwVfRopfS2F-WB3aF14AaABAg",
        content: 'I love how in the middle he said "I\'ve been able to work with 2 great coaches"',
        publishedTimeText: "9 days ago",
        publishedTime: "2025-01-23T23:14:02.948Z",
        replyLevel: 0,
        author: {
          name: "@SimonT80",
          channelId: "UC8JC3uSUmmXTCTKl-bgr1DA",
          isVerified: false,
          avatarUrl: "https://yt3.ggpht.com/ytc/avatar=s88",
        },
        engagement: { likes: 110, replies: 5 },
        repliesContinuationToken: "Eg0SC2RRdzR3...",
      },
    ],
    continuationToken: "Eg0SCzVFV2F4bVd....",
  };
}

export function scYoutubeTranscript(id = SC_YT_VIDEO_ID) {
  return {
    ...meta,
    videoId: id,
    type: "video",
    url: `https://www.youtube.com/watch?v=${id}`,
    transcript: [
      {
        text: "welcome back to the hell farm and the",
        startMs: "160",
        endMs: "1920",
        startTimeText: "0:00",
      },
      { text: "backyard trails", startMs: "1920", endMs: "3000", startTimeText: "0:01" },
    ],
    transcript_only_text: "welcome back to the hell farm and the backyard trails",
    language: "English",
  };
}

/** Documented behaviour: no caption track -> transcript fields are null and 0 credits are charged. */
export function scYoutubeNoTranscript(id = SC_YT_NO_CAPTIONS_ID) {
  return {
    success: true,
    credits_remaining: 1000000,
    credits_charged: 0,
    videoId: id,
    type: "video",
    url: `https://www.youtube.com/watch?v=${id}`,
    transcript: null,
    transcript_only_text: null,
    language: null,
  };
}

function tiktokPost(id: string, overrides: Record<string, unknown> = {}) {
  return {
    aweme_id: id,
    desc: "You can say whatever you want about the WNBA is but it’s never boring",
    desc_language: "en",
    region: "US",
    statistics: {
      aweme_id: id,
      collect_count: 1633,
      comment_count: 618,
      digg_count: 62522,
      play_count: 589745,
      share_count: 1250,
      lose_comment_count: 0,
    },
    video: {
      cover: {
        height: 720,
        uri: "tos-useast5-p-0068-tx/cover",
        url_list: [`https://p16-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/${id}~cover.jpeg`],
      },
      duration: 173675,
      has_watermark: true,
    },
    author: {
      nickname: "Dave Portnoy",
      unique_id: "stoolpresidente",
      comment_setting: 0,
      avatar_thumb: { url_list: ["https://p16-amd-va.tiktokcdn.com/avatar.jpeg"] },
    },
    create_time: 1750214725,
    create_time_utc: "2025-06-18T02:45:25.000Z",
    is_ad: false,
    url: `https://www.tiktok.com/@stoolpresidente/video/${id}`,
    ...overrides,
  };
}

export function scTiktokSearch() {
  return {
    ...meta,
    // TikTok "may return duplicate results": the second item repeats the first.
    search_item_list: [
      tiktokPost(TT_VIDEO_ID),
      tiktokPost(TT_VIDEO_ID),
      tiktokPost(TT_OTHER_ID, { desc: "Tìm 'musclesandnursing'", author: { nickname: "grey" } }),
    ],
    cursor: 20,
  };
}

export function scTiktokVideo(id = TT_VIDEO_ID) {
  const commentsOff = id === TT_COMMENTS_OFF_ID;
  return {
    ...meta,
    aweme_detail: tiktokPost(id, commentsOff ? { item_comment_settings: 3 } : {}),
  };
}

export function scTiktokComments(id = TT_VIDEO_ID) {
  return {
    ...meta,
    comments: [
      {
        aweme_id: id,
        text: "DAVE BUY A TEAM",
        user: {
          nickname: "Robert Lessner",
          unique_id: "dimebag.duster",
          avatar_thumb: { uri: "x", url_list: ["https://p16-sign.tiktokcdn-us.com/avatar1.jpg"] },
          sec_uid: "MS4wLjABAAAA",
        },
        create_time: 1750216932,
        reply_comment_total: 14,
        digg_count: 3322,
        comment_language: "en",
      },
    ],
    cursor: 20,
    total: 1114,
  };
}

export function scTiktokTranscript(id = TT_VIDEO_ID) {
  return {
    ...meta,
    id,
    url: `https://www.tiktok.com/@stoolpresidente/video/${id}`,
    transcript:
      "WEBVTT\n\n\n00:00:00.120 --> 00:00:01.840\nAlright, pizza review time.\n\n" +
      "00:00:01.841 --> 00:00:03.761\nSal's Pizza Factory.\\n",
  };
}

export function scTiktokNoTranscript(id = TT_NO_TRANSCRIPT_ID) {
  return { ...meta, id, url: `https://www.tiktok.com/@a/video/${id}`, transcript: null };
}
