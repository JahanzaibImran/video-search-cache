import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import type { CreditUsage } from "@/lib/api/types";

export type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: ApiClientError };

/**
 * Runs `fetcher` whenever `key` changes (skipped while `key` is null), aborting
 * the previous request so a slow, stale response can never overwrite a newer one.
 * Every response, success or error, reports the latest credit balance.
 */
export function useApiQuery<T extends { credits: CreditUsage }>(
  key: string | null,
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
  onCredits: (credits: CreditUsage) => void,
): { state: QueryState<T>; retry: () => void } {
  const [state, setState] = useState<QueryState<T>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  // Keep the latest callbacks without making them effect dependencies.
  const fetcherRef = useRef(fetcher);
  const onCreditsRef = useRef(onCredits);
  useEffect(() => {
    fetcherRef.current = fetcher;
    onCreditsRef.current = onCredits;
  });

  useEffect(() => {
    if (key === null) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    fetcherRef
      .current(key, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        onCreditsRef.current(data.credits);
        setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof ApiClientError
            ? error
            : new ApiClientError("INTERNAL_ERROR", "Something went wrong.", 0);
        if (apiError.credits) onCreditsRef.current(apiError.credits);
        setState({ status: "error", error: apiError });
      });

    return () => controller.abort();
  }, [key, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
