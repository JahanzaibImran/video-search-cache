"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export interface SearchBoxProps {
  /** Called with the trimmed query (or pasted link) once typing pauses, or immediately on Enter. */
  onSearch: (query: string) => void;
  isLoading?: boolean;
  debounceMs?: number;
  maxLength?: number;
}

export function SearchBox({
  onSearch,
  isLoading = false,
  debounceMs = 400,
  // Generous so long pasted TikTok/YouTube links aren't cut off; the server limits search text to 100.
  maxLength = 500,
}: SearchBoxProps) {
  const [value, setValue] = useState("");
  const debounced = useDebouncedValue(value, debounceMs);
  const lastSubmitted = useRef("");
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  const submit = (raw: string) => {
    const query = raw.trim();
    // Skip no-op searches, e.g. adding a trailing space, or Enter followed by the debounce firing.
    if (query === lastSubmitted.current) return;
    lastSubmitted.current = query;
    onSearchRef.current(query);
  };

  useEffect(() => submit(debounced), [debounced]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
      className="relative"
    >
      <label htmlFor="video-search" className="sr-only">
        Search videos or paste a YouTube or TikTok link
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-zinc-400"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        id="video-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={maxLength}
        placeholder="Search, or paste a YouTube / TikTok link"
        autoComplete="off"
        aria-busy={isLoading}
        className="w-full rounded-xl border border-zinc-200 bg-white py-3.5 pr-12 pl-12 text-base shadow-sm transition outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200/60"
      />
      {isLoading && (
        <span role="status" className="absolute top-1/2 right-4 -translate-y-1/2">
          <span className="block size-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          <span className="sr-only">Searching…</span>
        </span>
      )}
    </form>
  );
}
