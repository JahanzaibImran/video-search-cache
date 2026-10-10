import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueryState } from "@/hooks/useApiQuery";
import type { CacheMeta, CommentsSlot, VideoCommentsResponse, VideoDetails } from "@/lib/api/types";
import { VideoDetailPanel } from "./VideoDetailPanel";

const meta: CacheMeta = {
  cacheKey: "youtube:video:vid00000001",
  source: "upstream",
  cached: false,
  creditsCharged: 1,
  fetchedAt: "2024-01-01T00:00:00.000Z",
};

const video: VideoDetails = {
  id: "vid00000001",
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=vid00000001",
  title: "A video",
  description: "",
  channelTitle: "Channel",
  publishedAt: "2024-01-01T00:00:00Z",
  thumbnailUrl: null,
  duration: "PT1M",
  viewCount: 10,
  likeCount: 1,
  commentCount: 0,
  commentsDisabled: null,
};

function renderWithComments(comments: CommentsSlot) {
  const state: QueryState<VideoCommentsResponse> = {
    status: "success",
    data: {
      video: { data: video, meta },
      comments,
      credits: { used: 1, limit: 20, remaining: 19 },
    },
  };
  render(
    <VideoDetailPanel
      videoRef={{ platform: "youtube", id: video.id }}
      state={state}
      canLoadTranscript={false}
      onCredits={vi.fn()}
      onClose={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
}

describe("VideoDetailPanel comments", () => {
  it("turned off: says so, and that no credits were used", () => {
    renderWithComments({
      data: { comments: [], disabled: true },
      meta: { ...meta, creditsCharged: 0 },
    });

    expect(screen.getByText("Comments are turned off for this video.")).toBeInTheDocument();
    expect(screen.getByText(/No credits were used/)).toBeInTheDocument();
    expect(screen.queryByText("No comments yet.")).not.toBeInTheDocument();
  });

  it("none yet: says comments are open but empty", () => {
    renderWithComments({ data: { comments: [], disabled: false }, meta });

    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(screen.getByText(/Comments are open/)).toBeInTheDocument();
    expect(screen.queryByText(/turned off/)).not.toBeInTheDocument();
  });

  it("failed: shows the error with a retry button, while video details stay visible", () => {
    renderWithComments({
      error: { code: "UPSTREAM_ERROR", message: "The video provider didn't respond as expected." },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load comments");
    expect(screen.getByRole("alert")).toHaveTextContent("didn't respond as expected");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A video" })).toBeInTheDocument();
  });

  it("not enough credits for comments: a warning, no retry button", () => {
    renderWithComments({
      error: {
        code: "CREDIT_LIMIT_REACHED",
        message: "Loading comments costs 2 credits and you have 1 left.",
      },
    });

    expect(screen.getByText("Not enough credits for comments")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
