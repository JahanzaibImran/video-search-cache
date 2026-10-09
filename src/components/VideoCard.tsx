import Image from "next/image";
import type { VideoSummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { CacheBadge } from "./CacheBadge";

export interface VideoCardProps {
  video: VideoSummary;
  cached: boolean;
  fetchedAt?: string;
  creditsCharged?: number;
  onSelect: (video: VideoSummary) => void;
}

export function VideoCard({ video, cached, fetchedAt, creditsCharged, onSelect }: VideoCardProps) {
  return (
    <article className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onSelect(video)}
        className="block w-full text-left focus-visible:ring-4 focus-visible:ring-zinc-300 focus-visible:outline-none"
      >
        <div className="relative aspect-video bg-zinc-100">
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              No thumbnail
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 leading-snug font-medium text-zinc-900 group-hover:text-zinc-700">
            {video.title}
          </h3>
          <div className="flex items-center justify-between gap-2 text-sm text-zinc-500">
            <p className="min-w-0 truncate">
              <span className="sr-only">Channel: </span>
              {video.channelTitle}
            </p>
            <CacheBadge cached={cached} fetchedAt={fetchedAt} creditsCharged={creditsCharged} />
          </div>
          <p className="text-xs text-zinc-400">
            <time dateTime={video.publishedAt}>{formatDate(video.publishedAt)}</time>
          </p>
        </div>
      </button>
    </article>
  );
}
