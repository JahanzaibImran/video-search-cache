import { formatAge } from "@/lib/format";

export interface CacheBadgeProps {
  cached: boolean;
  /** ISO time of the upstream fetch, shown in the tooltip. */
  fetchedAt?: string;
}

/** Makes caching visible: "cached" cost nothing, "fresh" spent one credit. */
export function CacheBadge({ cached, fetchedAt }: CacheBadgeProps) {
  const age = fetchedAt ? ` (fetched ${formatAge(fetchedAt)})` : "";
  const title = cached
    ? `Served from cache, no credit used${age}`
    : "Fetched live from YouTube, 1 credit used";

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase ring-1 ring-inset ${
        cached
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-amber-50 text-amber-700 ring-amber-600/20"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${cached ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {cached ? "cached" : "fresh"}
    </span>
  );
}
