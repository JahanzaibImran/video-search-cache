// The YouTube client predates the provider abstraction; its errors are now the shared provider errors.
export {
  NotFoundError,
  ProviderError as YouTubeError,
  RateLimitError,
  UpstreamError,
} from "@/lib/providers/errors";
