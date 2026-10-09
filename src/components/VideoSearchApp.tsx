"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { ApiClientError, api } from "@/lib/api/client";
import type {
  CreditUsage,
  Platform,
  SearchResponse,
  VideoRef,
  VideoSummary,
} from "@/lib/api/types";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { formatCredits } from "@/lib/format";
import { PLATFORMS, type ProviderCapabilities } from "@/lib/providers/types";
import { looksLikeUrl } from "@/lib/providers/urls";
import { AppHeader } from "./AppHeader";
import { CreditsIndicator } from "./CreditsIndicator";
import { PLATFORM_LABELS, PlatformToggle } from "./PlatformToggle";
import { SearchBox } from "./SearchBox";
import { RetryButton, StatusMessage } from "./StatusMessage";
import { VideoCard } from "./VideoCard";
import { VideoDetailPanel } from "./VideoDetailPanel";

export interface VideoSearchAppProps {
  /** What the configured provider can do, so the UI only offers what will work. */
  capabilities: ProviderCapabilities;
}

/** The video the detail panel shows. `summary` is there when it was picked from results. */
interface Selection {
  ref: VideoRef;
  summary?: VideoSummary;
}

/**
 * Client-side composition: holds UI state and calls our API. All caching and
 * credit rules live on the server, so this component only renders what it's told.
 */
export function VideoSearchApp({ capabilities }: VideoSearchAppProps) {
  const searchable = PLATFORMS.filter((p) => capabilities[p].search);
  const [platform, setPlatform] = useState<Platform>(searchable[0] ?? "youtube");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditUsage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .credits(controller.signal)
      .then((data) => setCredits(data.credits))
      .catch(() => {}); // non-critical: the next search response carries the balance anyway
    return () => controller.abort();
  }, []);

  // The key changes when either the platform or the query does, which re-runs the search.
  const search = useApiQuery(
    query ? `${platform}|${query}` : null,
    (_key, signal) => api.search(query, platform, signal),
    setCredits,
  );
  const details = useApiQuery(
    selected ? `${selected.ref.platform}|${selected.ref.id}` : null,
    (_key, signal) => api.videoComments(selected!.ref, signal),
    setCredits,
  );
  const closeDetails = useCallback(() => setSelected(null), []);

  /** Search text goes to search; a pasted link opens that video directly (resolving it is free). */
  const onInput = useCallback((input: string) => {
    setLinkError(null);
    if (!looksLikeUrl(input)) {
      setQuery(input);
      return;
    }
    api
      .resolve(input)
      .then(({ ref }) => setSelected({ ref }))
      .catch((error: unknown) =>
        setLinkError(error instanceof ApiClientError ? error.message : "Couldn't open that link."),
      );
  }, []);

  return (
    <>
      <AppHeader>
        <CreditsIndicator credits={credits} />
      </AppHeader>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex justify-center">
            <PlatformToggle platforms={searchable} value={platform} onChange={setPlatform} />
          </div>
          <SearchBox onSearch={onInput} isLoading={search.state.status === "loading"} />
          {linkError && (
            <p role="alert" className="text-center text-sm text-rose-700">
              {linkError}
            </p>
          )}
        </div>

        <SearchResults
          state={search.state}
          query={query}
          platform={platform}
          onRetry={search.retry}
          onSelect={(summary) =>
            setSelected({ ref: { platform: summary.platform, id: summary.id }, summary })
          }
        />
      </main>

      {selected && (
        <VideoDetailPanel
          videoRef={selected.ref}
          summary={selected.summary}
          state={details.state}
          canLoadTranscript={capabilities[selected.ref.platform].transcript}
          onCredits={setCredits}
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
  platform: Platform;
  onRetry: () => void;
  onSelect: (video: VideoSummary) => void;
}

function SearchResults({ state, query, platform, onRetry, onSelect }: SearchResultsProps) {
  switch (state.status) {
    case "idle":
      return (
        <StatusMessage title="Search, or paste a YouTube or TikTok link">
          A new search costs {formatCredits(CREDIT_COSTS.search)}, video details{" "}
          {formatCredits(CREDIT_COSTS.videoDetails)}, comments{" "}
          {formatCredits(CREDIT_COSTS.comments)} and a transcript{" "}
          {formatCredits(CREDIT_COSTS.transcript)}. Repeat any of them (even with different
          capitalisation, spacing or link format) and it&apos;s served from cache for free. Look for
          the <span className="font-medium text-amber-700">fresh</span> and{" "}
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
      const retryable =
        error.code !== "INVALID_INPUT" &&
        error.code !== "NOT_CONFIGURED" &&
        error.code !== "UNSUPPORTED";
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
          <StatusMessage title={`No ${PLATFORM_LABELS[platform]} videos found for “${query}”`}>
            Try a different search.
          </StatusMessage>
        );
      }
      return (
        <section aria-label="Search results" className="space-y-3">
          <p className="text-sm text-zinc-500">
            {results.length} {PLATFORM_LABELS[platform]} results for{" "}
            <span className="font-medium text-zinc-800">“{query}”</span>
            {meta.cached
              ? " · served from cache, no credits used"
              : ` · fetched live, ${formatCredits(meta.creditsCharged)} used`}
          </p>
          <ResultsGrid>
            {results.map((video) => (
              <li key={`${video.platform}:${video.id}`}>
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
