"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { api } from "@/lib/api/client";
import type { CreditUsage, SearchResponse, VideoSummary } from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { formatCredits } from "@/lib/format";
import { AppHeader } from "./AppHeader";
import { CreditsIndicator } from "./CreditsIndicator";
import { SearchBox } from "./SearchBox";
import { RetryButton, StatusMessage } from "./StatusMessage";
import { VideoCard } from "./VideoCard";
import { VideoDetailPanel } from "./VideoDetailPanel";

/**
 * Client-side composition: holds UI state and calls our API. All caching and
 * credit rules live on the server, so this component only renders what it's told.
 */
export function VideoSearchApp() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VideoSummary | null>(null);
  const [credits, setCredits] = useState<CreditUsage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .credits(controller.signal)
      .then((data) => setCredits(data.credits))
      .catch(() => {}); // non-critical: the next search response carries the balance anyway
    return () => controller.abort();
  }, []);

  const search = useApiQuery(query || null, api.search, setCredits);
  const details = useApiQuery(selected?.id ?? null, api.videoComments, setCredits);
  const closeDetails = useCallback(() => setSelected(null), []);

  return (
    <>
      <AppHeader>
        <CreditsIndicator credits={credits} />
      </AppHeader>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <SearchBox onSearch={setQuery} isLoading={search.state.status === "loading"} />
        </div>

        <SearchResults
          state={search.state}
          query={query}
          onRetry={search.retry}
          onSelect={setSelected}
        />
      </main>

      {selected && (
        <VideoDetailPanel
          summary={selected}
          state={details.state}
          onClose={closeDetails}
          onRetry={details.retry}
        />
      )}
    </>
  );
}

interface SearchResultsProps {
  state: ReturnType<typeof useApiQuery<SearchResponse>>["state"];
  query: string;
  onRetry: () => void;
  onSelect: (video: VideoSummary) => void;
}

function SearchResults({ state, query, onRetry, onSelect }: SearchResultsProps) {
  switch (state.status) {
    case "idle":
      return (
        <StatusMessage title="Search for any topic to get started">
          A new search costs {formatCredits(CREDIT_COSTS.search)}, video details{" "}
          {formatCredits(CREDIT_COSTS.videoDetails)} and comments{" "}
          {formatCredits(CREDIT_COSTS.comments)}. Repeat any of them (even with different
          capitalisation or spacing) and it&apos;s served from cache for free. Look for the{" "}
          <span className="font-medium text-amber-700">fresh</span> and{" "}
          <span className="font-medium text-emerald-700">cached</span> badges.
        </StatusMessage>
      );

    case "loading":
      return (
        <ResultsGrid aria-busy="true" aria-label="Loading results">
          {Array.from({ length: 8 }, (_, i) => (
            <li
              key={i}
              className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white"
            >
              <div className="aspect-video bg-zinc-100" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-11/12 rounded bg-zinc-100" />
                <div className="h-3 w-1/2 rounded bg-zinc-100" />
              </div>
            </li>
          ))}
        </ResultsGrid>
      );

    case "error": {
      const { error } = state;
      if (error.code === "CREDIT_LIMIT_REACHED") {
        return (
          <StatusMessage tone="warning" title="Not enough credits for a new search">
            {error.message}
          </StatusMessage>
        );
      }
      const retryable = error.code !== "INVALID_INPUT" && error.code !== "NOT_CONFIGURED";
      return (
        <StatusMessage
          tone="error"
          title="Search failed"
          action={retryable ? <RetryButton onClick={onRetry} /> : undefined}
        >
          {error.message}
        </StatusMessage>
      );
    }

    case "success": {
      const { results, meta } = state.data;
      if (results.length === 0) {
        return (
          <StatusMessage title={`No videos found for “${query}”`}>
            Try a different search.
          </StatusMessage>
        );
      }
      return (
        <section aria-label="Search results" className="space-y-3">
          <p className="text-sm text-zinc-500">
            {results.length} results for{" "}
            <span className="font-medium text-zinc-800">“{query}”</span>
            {meta.cached
              ? " · served from cache, no credits used"
              : ` · fetched live, ${formatCredits(meta.creditsCharged)} used`}
          </p>
          <ResultsGrid>
            {results.map((video) => (
              <li key={video.id}>
                <VideoCard
                  video={video}
                  cached={meta.cached}
                  fetchedAt={meta.fetchedAt}
                  creditsCharged={meta.creditsCharged}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ResultsGrid>
        </section>
      );
    }
  }
}

function ResultsGrid(props: React.ComponentProps<"ul">) {
  return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" {...props} />;
}
