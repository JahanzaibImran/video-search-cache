// Pinned to en-US/UTC so server and client renders agree (no hydration mismatch).
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "2024-01-15T12:00:00Z" -> "Jan 15, 2024" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

/** 123456 -> "123.5K" */
export function formatCompactNumber(value: number): string {
  return compactFormatter.format(value);
}

/** ISO 8601 duration -> clock time: "PT10M3S" -> "10:03", "PT1H2M" -> "1:02:00". */
export function formatDuration(iso: string): string | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const totalHours = Number(days) * 24 + Number(hours);
  const mm = totalHours > 0 ? minutes.padStart(2, "0") : minutes;
  const ss = seconds.padStart(2, "0");
  return totalHours > 0 ? `${totalHours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "fetched 3 minutes ago"-style label relative to `now`. */
export function formatAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
