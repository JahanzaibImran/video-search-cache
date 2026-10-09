import { AppHeader } from "@/components/AppHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { VideoSearchApp } from "@/components/VideoSearchApp";
import { API_KEY_ENV, loadConfig, selectedApiKey, type AppConfig } from "@/lib/config";
import { getContainer } from "@/lib/container";
import { ConfigError } from "@/lib/errors";

// Read env at request time, not build time, so adding a key only needs a restart.
export const dynamic = "force-dynamic";

export default function HomePage() {
  let problem: string | undefined;
  let config: AppConfig | undefined;
  try {
    config = loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    problem = `${error.message}. Check your .env.local against .env.example.`;
  }

  const videoService = config && selectedApiKey(config) ? getContainer().videoService : null;
  if (!config || !videoService) {
    return (
      <>
        <AppHeader />
        <SetupNotice
          problem={problem}
          provider={config?.provider ?? "youtube"}
          keyEnv={API_KEY_ENV[config?.provider ?? "youtube"]}
        />
      </>
    );
  }
  return <VideoSearchApp capabilities={videoService.provider.capabilities} />;
}
