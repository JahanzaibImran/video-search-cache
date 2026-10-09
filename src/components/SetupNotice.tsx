import type { VideoProviderName } from "@/lib/config";

export interface SetupNoticeProps {
  /** Extra detail, e.g. which env var failed validation. */
  problem?: string;
  provider: VideoProviderName;
  /** The env var that holds the selected provider's key. */
  keyEnv: string;
}

const KEY_LINKS: Record<VideoProviderName, { label: string; href: string; what: string }> = {
  youtube: {
    label: "Google Cloud Console",
    href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    what: "the YouTube Data API v3",
  },
  scrapecreators: {
    label: "ScrapeCreators dashboard",
    href: "https://app.scrapecreators.com",
    what: "ScrapeCreators (YouTube + TikTok)",
  },
};

/** Shown instead of the app when the server isn't configured, rather than crashing. */
export function SetupNotice({ problem, provider, keyEnv }: SetupNoticeProps) {
  const link = KEY_LINKS[provider];
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <p className="text-sm font-medium tracking-wide text-amber-700 uppercase">Setup needed</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Add an API key to get started</h1>
        <p className="mt-3 text-zinc-700">
          {problem ??
            `VIDEO_PROVIDER is "${provider}", but ${keyEnv} isn't set, so the app can't fetch videos yet.`}
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm text-zinc-700">
          <li>
            Create a key for <strong>{link.what}</strong> in the{" "}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-rose-600 underline-offset-2 hover:underline"
            >
              {link.label}
            </a>
            .
          </li>
          <li>
            Copy the example env file:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-amber-200">
              cp .env.example .env.local
            </code>
          </li>
          <li>
            Set{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-amber-200">
              {keyEnv}=your-key
            </code>{" "}
            and restart <code className="font-mono text-xs">npm run dev</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
