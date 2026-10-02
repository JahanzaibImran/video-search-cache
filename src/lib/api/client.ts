import type {
  ApiErrorCode,
  ApiErrorResponse,
  CreditUsage,
  CreditsResponse,
  SearchResponse,
  VideoCommentsResponse,
} from "./types";

/** An error response from our own API, carrying its code and the user's latest balance. */
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly credits?: CreditUsage,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("INTERNAL_ERROR", "Network error. Check your connection.", 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { error, credits } = (body ?? {}) as Partial<ApiErrorResponse>;
    throw new ApiClientError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed (${response.status})`,
      response.status,
      credits,
    );
  }
  return body as T;
}

export const api = {
  search: (query: string, signal?: AbortSignal) =>
    getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`, signal),
  videoComments: (videoId: string, signal?: AbortSignal) =>
    getJson<VideoCommentsResponse>(`/api/videos/${encodeURIComponent(videoId)}/comments`, signal),
  credits: (signal?: AbortSignal) => getJson<CreditsResponse>("/api/credits", signal),
};
