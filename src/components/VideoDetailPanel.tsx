"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useApiQuery, type QueryState } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/client";
import type {
  CreditUsage,
  VideoComment,
  VideoCommentsResponse,
  VideoRef,
  VideoSummary,
} from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import {
  formatCompactNumber,
  formatCredits,
  formatDate,
  formatDuration,
  plural,
} from "@/lib/format";
import { canonicalVideoUrl } from "@/lib/providers/urls";
import { CacheBadge } from "./CacheBadge";
import { PLATFORM_LABELS } from "./PlatformToggle";
import { RetryButton, StatusMessage } from "./StatusMessage";

export interface VideoDetailPanelProps {
  videoRef: VideoRef;
  /** Shown straight away when the video was picked from results; absent for a pasted link. */
  summary?: VideoSummary;
  state: QueryState<VideoCommentsResponse>;
  /** Whether the configured provider can fetch transcripts for this platform. */
  canLoadTranscript: boolean;
  onCredits: (credits: CreditUsage) => void;
  onClose: () => void;
  onRetry: () => void;
}

export function VideoDetailPanel({
  videoRef,
  summary,
  state,
  canLoadTranscript,
  onCredits,
  onClose,
  onRetry,
}: VideoDetailPanelProps) {
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
  const title = video?.title ?? summary?.title ?? "Loading video…";
  const thumbnailUrl = video?.thumbnailUrl ?? summary?.thumbnailUrl ?? null;
  const channelTitle = video?.channelTitle ?? summary?.channelTitle;
  const publishedAt = video?.publishedAt ?? summary?.publishedAt ?? null;
  const watchUrl = video?.url ?? summary?.url ?? canonicalVideoUrl(videoRef);

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
          <span className="text-sm font-medium text-zinc-500">
            {PLATFORM_LABELS[videoRef.platform]} video details
          </span>
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
          {thumbnailUrl && (
            <Image src={thumbnailUrl} alt="" fill sizes="576px" className="object-cover" />
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
                {title}
              </h2>
              {details && (
                <CacheBadge
                  cached={details.video.meta.cached}
                  fetchedAt={details.video.meta.fetchedAt}
                  creditsCharged={details.video.meta.creditsCharged}
                />
              )}
            </div>
            {(channelTitle || publishedAt) && (
              <p className="text-sm text-zinc-500">
                {[channelTitle, publishedAt && formatDate(publishedAt)].filter(Boolean).join(" · ")}
              </p>
            )}
            {video && (
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
                <Stat label="view" value={video.viewCount} />
                <Stat label="like" value={video.likeCount} />
                <Stat label="comment" value={video.commentCount} />
              </ul>
            )}
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              Watch on {PLATFORM_LABELS[videoRef.platform]} <span aria-hidden="true">↗</span>
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

          {canLoadTranscript && <TranscriptSection videoRef={videoRef} onCredits={onCredits} />}
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
          title={
            state.error.code === "CREDIT_LIMIT_REACHED"
              ? "Not enough credits"
              : "Couldn't load comments"
          }
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
          <span className="font-medium text-zinc-800">{comment.authorName}</span>
          {comment.publishedAt && ` · ${formatDate(comment.publishedAt)}`}
        </p>
        <p className="mt-1 text-sm wrap-break-word whitespace-pre-line text-zinc-700">
          {comment.text}
        </p>
        <p className="mt-1 text-xs text-zinc-400 tabular-nums">
          {formatCompactNumber(comment.likeCount)} {plural(comment.likeCount, "like")}
          {comment.replyCount > 0 &&
            ` · ${formatCompactNumber(comment.replyCount)} ${plural(comment.replyCount, "reply", "replies")}`}
        </p>
      </div>
    </li>
  );
}

/** Loaded on demand: transcripts cost credits, so nothing is fetched until the user asks. */
function TranscriptSection({
  videoRef,
  onCredits,
}: {
  videoRef: VideoRef;
  onCredits: (credits: CreditUsage) => void;
}) {
  const [requested, setRequested] = useState(false);
  const { state, retry } = useApiQuery(
    requested ? `${videoRef.platform}|${videoRef.id}` : null,
    (_key, signal) => api.transcript(videoRef, signal),
    onCredits,
  );

  return (
    <section aria-labelledby="transcript-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="transcript-heading" className="font-medium text-zinc-900">
          Transcript
        </h3>
        {state.status === "success" && (
          <CacheBadge
            cached={state.data.transcript.meta.cached}
            fetchedAt={state.data.transcript.meta.fetchedAt}
            creditsCharged={state.data.transcript.meta.creditsCharged}
          />
        )}
      </div>

      {state.status === "idle" && (
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Load transcript ({formatCredits(CREDIT_COSTS.transcript)}, free if cached or unavailable)
        </button>
      )}
      {state.status === "loading" && <p className="text-sm text-zinc-500">Loading transcript…</p>}
      {state.status === "error" && (
        <StatusMessage
          tone={state.error.code === "CREDIT_LIMIT_REACHED" ? "warning" : "error"}
          title="Couldn't load the transcript"
          action={
            state.error.code === "CREDIT_LIMIT_REACHED" ? undefined : (
              <RetryButton onClick={retry} />
            )
          }
        >
          {state.error.message}
        </StatusMessage>
      )}
      {state.status === "success" &&
        (state.data.transcript.data.available ? (
          <p className="max-h-72 overflow-y-auto rounded-lg bg-zinc-50 p-3 text-sm leading-relaxed whitespace-pre-line text-zinc-700">
            {state.data.transcript.data.text}
          </p>
        ) : (
          <StatusMessage title="No transcript is available for this video.">
            It has no captions. No credits were used.
          </StatusMessage>
        ))}
    </section>
  );
}
