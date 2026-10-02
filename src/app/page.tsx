import { AppHeader } from "@/components/AppHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { VideoSearchApp } from "@/components/VideoSearchApp";
import { loadConfig } from "@/lib/config";
import { ConfigError } from "@/lib/errors";

// Read env at request time, not build time, so adding a key only needs a restart.
export const dynamic = "force-dynamic";

export default function HomePage() {
  let problem: string | undefined;
  let configured = false;
  try {
    configured = loadConfig().youtubeApiKey !== null;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    problem = `${error.message}. Check your .env.local against .env.example.`;
  }

  if (!configured) {
    return (
      <>
        <AppHeader />
        <SetupNotice problem={problem} />
      </>
    );
  }
  return <VideoSearchApp />;
}
