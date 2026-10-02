export interface SetupNoticeProps {
  /** Extra detail, e.g. which env var failed validation. */
  problem?: string;
}

/** Shown instead of the app when the server isn't configured, rather than crashing. */
export function SetupNotice({ problem }: SetupNoticeProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <p className="text-sm font-medium tracking-wide text-amber-700 uppercase">Setup needed</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          Add a YouTube API key to get started
        </h1>
        <p className="mt-3 text-zinc-700">
          {problem ?? "The server has no YOUTUBE_API_KEY, so it can't search YouTube yet."}
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm text-zinc-700">
          <li>
            Create a key for the <strong>YouTube Data API v3</strong> in the{" "}
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-rose-600 underline-offset-2 hover:underline"
            >
              Google Cloud Console
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
              YOUTUBE_API_KEY=your-key
            </code>{" "}
            and restart <code className="font-mono text-xs">npm run dev</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
