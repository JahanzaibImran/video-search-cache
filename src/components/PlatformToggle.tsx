import type { Platform } from "@/lib/api/types";

export const PLATFORM_LABELS: Record<Platform, string> = { youtube: "YouTube", tiktok: "TikTok" };

export interface PlatformToggleProps {
  platforms: readonly Platform[];
  value: Platform;
  onChange: (platform: Platform) => void;
}

/** Segmented control for which platform to search. Hidden when there's only one choice. */
export function PlatformToggle({ platforms, value, onChange }: PlatformToggleProps) {
  if (platforms.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Platform" className="inline-flex rounded-lg bg-zinc-100 p-1">
      {platforms.map((platform) => (
        <button
          key={platform}
          type="button"
          role="radio"
          aria-checked={platform === value}
          onClick={() => onChange(platform)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            platform === value
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {PLATFORM_LABELS[platform]}
        </button>
      ))}
    </div>
  );
}
