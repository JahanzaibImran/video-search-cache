/**
 * Provider-neutral domain types. Every provider maps its raw payloads into
 * these, so the service, routes and UI never depend on an upstream shape.
 */

export const PLATFORMS = ["youtube", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Identifies one video on one platform. IDs are case-sensitive and used as-is. */
export interface VideoRef {
  platform: Platform;
  id: string;
}

export interface VideoSummary {
  id: string;
  platform: Platform;
  /** Canonical watch URL. */
  url: string;
  title: string;
  description: string;
  channelTitle: string;
  /** ISO 8601 timestamp, or `null` when the provider doesn't give an exact date. */
  publishedAt: string | null;
  thumbnailUrl: string | null;
}

export interface VideoDetails extends VideoSummary {
  /** ISO 8601 duration, e.g. "PT4M13S". */
  duration: string | null;
  /** `null` when the owner hides the statistic. */
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  /**
   * `true` when the video's own metadata says comments are turned off, so the
   * comments call can be skipped entirely. `null` when the provider can't tell.
   */
  commentsDisabled: boolean | null;
}

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: string | null;
}

export interface CommentsResult {
  comments: VideoComment[];
  /** True when the uploader has turned comments off (not the same as "no comments yet"). */
  disabled: boolean;
}

/**
 * A missing transcript is a normal answer, not an error: many videos simply
 * have no captions.
 */
export type TranscriptResult =
  | {
      available: true;
      /** Plain text, ready to read or feed to a model. */
      text: string;
      language: string | null;
      segments: TranscriptSegment[];
    }
  | { available: false; reason: "no_captions" };

export interface TranscriptSegment {
  startMs: number;
  endMs: number | null;
  text: string;
}

export type Feature = "search" | "video" | "comments" | "transcript";

/** What a provider can do on each platform. Checked before charging, so unsupported calls are free. */
export type ProviderCapabilities = Record<Platform, Record<Feature, boolean>>;

/** The one interface the service depends on. Implementations: YouTube Data API, ScrapeCreators. */
export interface VideoProvider {
  readonly name: "youtube" | "scrapecreators";
  readonly capabilities: ProviderCapabilities;
  search(platform: Platform, query: string): Promise<VideoSummary[]>;
  getVideo(ref: VideoRef): Promise<VideoDetails>;
  getComments(ref: VideoRef): Promise<CommentsResult>;
  getTranscript(ref: VideoRef): Promise<TranscriptResult>;
}
