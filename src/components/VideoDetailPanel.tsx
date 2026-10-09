"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { QueryState } from "@/hooks/useApiQuery";
import type { VideoCommentsResponse, VideoComment, VideoSummary } from "@/lib/api/types";
import { formatCompactNumber, formatDate, formatDuration, plural } from "@/lib/format";
import { CacheBadge } from "./CacheBadge";
import { RetryButton, StatusMessage } from "./StatusMessage";

export interface VideoDetailPanelProps {
  /** Shown straight away, from the search result, while details load. */
  summary: VideoSummary;
  state: QueryState<VideoCommentsResponse>;
  onClose: () => void;
  onRetry: () => void;
}

export function VideoDetailPanel({ summary, state, onClose, onRetry }: VideoDetailPanelProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const details = state.status === "success" ? state.data : null;
  const video = details?.video.data;
  const duration = video?.duration ? formatDuration(video.duration) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-detail-title"
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/90 px-5 py-3 backdrop-blur">
          <span className="text-sm font-medium text-zinc-500">Video details</span>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:outline-none"
          >
            Close <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="relative aspect-video bg-zinc-100">
          {summary.thumbnailUrl && (
            <Image src={summary.thumbnailUrl} alt="" fill sizes="576px" className="object-cover" />
          )}
          {duration && (
            <span className="absolute right-3 bottom-3 rounded bg-zinc-900/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
              {duration}
            </span>
          )}
        </div>

        <div className="space-y-6 p-5">
          <header className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="video-detail-title"
                className="text-lg leading-snug font-semibold text-zinc-900"
              >
                {video?.title ?? summary.title}
              </h2>
              {details && (
                <CacheBadge
                  cached={details.video.meta.cached}
                  fetchedAt={details.video.meta.fetchedAt}
                  creditsCharged={details.video.meta.creditsCharged}
                />
              )}
            </div>
            <p className="text-sm text-zinc-500">
              {summary.channelTitle} · {formatDate(summary.publishedAt)}
            </p>
            {video && (
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
                <Stat label="view" value={video.viewCount} />
                <Stat label="like" value={video.likeCount} />
                <Stat label="comment" value={video.commentCount} />
              </ul>
            )}
            <a
              href={`https://www.youtube.com/watch?v=${summary.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              Watch on YouTube <span aria-hidden="true">↗</span>
            </a>
          </header>

          <section aria-labelledby="comments-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="comments-heading" className="font-medium text-zinc-900">
                Top comments
              </h3>
              {details && (
                <CacheBadge
                  cached={details.comments.meta.cached}
                  fetchedAt={details.comments.meta.fetchedAt}
                  creditsCharged={details.comments.meta.creditsCharged}
                />
              )}
            </div>
            <CommentsBody state={state} onRetry={onRetry} />
          </section>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <li>
      <span className="font-medium text-zinc-900 tabular-nums">{formatCompactNumber(value)}</span>{" "}
      {plural(value, label)}
    </li>
  );
}

function CommentsBody({ state, onRetry }: Pick<VideoDetailPanelProps, "state" | "onRetry">) {
  switch (state.status) {
    case "idle":
    case "loading":
      return (
        <ul className="space-y-4" aria-label="Loading comments">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex animate-pulse gap-3">
              <div className="size-8 shrink-0 rounded-full bg-zinc-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-zinc-100" />
                <div className="h-3 w-full rounded bg-zinc-100" />
              </div>
            </li>
          ))}
        </ul>
      );
    case "error":
      return (
        <StatusMessage
          tone={state.error.code === "CREDIT_LIMIT_REACHED" ? "warning" : "error"}
          title="Couldn't load comments"
          action={
            state.error.code !== "CREDIT_LIMIT_REACHED" && state.error.code !== "NOT_FOUND" ? (
              <RetryButton onClick={onRetry} />
            ) : undefined
          }
        >
          {state.error.message}
        </StatusMessage>
      );
    case "success": {
      const { comments, disabled } = state.data.comments.data;
      if (disabled) return <StatusMessage title="Comments are turned off for this video." />;
      if (comments.length === 0) return <StatusMessage title="No comments yet." />;
      return (
        <ul className="divide-y divide-zinc-100">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ul>
      );
    }
  }
}

function CommentItem({ comment }: { comment: VideoComment }) {
  return (
    <li className="flex gap-3 py-3">
      {comment.authorAvatarUrl ? (
        <Image
          src={comment.authorAvatarUrl}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full bg-zinc-100"
        />
      ) : (
        <div className="size-8 shrink-0 rounded-full bg-zinc-200" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-800">{comment.authorName}</span> ·{" "}
          {formatDate(comment.publishedAt)}
        </p>
        <p className="mt-1 text-sm break-words whitespace-pre-line text-zinc-700">{comment.text}</p>
        <p className="mt-1 text-xs text-zinc-400 tabular-nums">
          {formatCompactNumber(comment.likeCount)} {plural(comment.likeCount, "like")}
          {comment.replyCount > 0 &&
            ` · ${formatCompactNumber(comment.replyCount)} ${plural(comment.replyCount, "reply", "replies")}`}
        </p>
      </div>
    </li>
  );
}
