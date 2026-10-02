/**
 * Domain types the rest of the app uses. They are deliberately smaller than
 * YouTube's raw payloads, so the UI never depends on the upstream shape.
 */

export interface VideoSummary {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  thumbnailUrl: string | null;
}

export interface VideoDetails extends VideoSummary {
  /** ISO 8601 duration, e.g. "PT4M13S". */
  duration: string | null;
  /** `null` when the owner hides the statistic. */
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: string;
}

export interface CommentsResult {
  comments: VideoComment[];
  /** True when the uploader has turned comments off. */
  disabled: boolean;
}
