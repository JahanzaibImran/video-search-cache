import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VideoSummary } from "@/lib/api/types";
import { VideoCard } from "./VideoCard";

const video: VideoSummary = {
  id: "vid00000001",
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=vid00000001",
  title: "Learn React Hooks & more in 10 minutes",
  description: "A quick tour",
  channelTitle: "Hooked on Code",
  publishedAt: "2024-01-15T12:00:00Z",
  thumbnailUrl: "https://i.ytimg.com/vi/vid00000001/hqdefault.jpg",
};

describe("VideoCard", () => {
  it("renders the title, channel, published date and thumbnail", () => {
    const { container } = render(<VideoCard video={video} cached={false} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Learn React Hooks & more in 10 minutes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hooked on Code")).toBeInTheDocument();
    expect(screen.getByText("Jan 15, 2024")).toHaveAttribute("datetime", video.publishedAt);
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent("https://i.ytimg.com/vi/vid00000001/hqdefault.jpg"),
    );
  });

  it("shows a 'cached' badge when the result came from cache", () => {
    render(<VideoCard video={video} cached onSelect={vi.fn()} />);

    const badge = screen.getByText("cached");
    expect(badge).toHaveAttribute("title", expect.stringContaining("no credits used"));
    expect(screen.queryByText("fresh")).not.toBeInTheDocument();
  });

  it("shows a 'fresh' badge with what the live fetch actually cost", () => {
    render(<VideoCard video={video} cached={false} creditsCharged={3} onSelect={vi.fn()} />);

    expect(screen.getByText("fresh")).toHaveAttribute("title", "Fetched live, 3 credits used");
  });

  it("falls back gracefully when there is no thumbnail", () => {
    render(<VideoCard video={{ ...video, thumbnailUrl: null }} cached onSelect={vi.fn()} />);
    expect(screen.getByText("No thumbnail")).toBeInTheDocument();
  });

  it("calls onSelect with the video when clicked", async () => {
    const onSelect = vi.fn();
    render(<VideoCard video={video} cached onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledWith(video);
  });
});
