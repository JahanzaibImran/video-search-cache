import type { TranscriptSegment } from "./types";

/** 173_675 ms -> "PT2M53S". The domain keeps ISO 8601 durations, as YouTube's API does. */
export function msToIsoDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || total === 0 ? `${s}S` : ""}`;
}

/** Unix seconds -> ISO string, or null when absent/invalid. */
export function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

const CUE_TIMING = /^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+((\d{2}:)?\d{2}:\d{2}[.,]\d{3})/;

/**
 * Minimal WEBVTT parser for TikTok captions: keeps cue timings and text,
 * drops the header, cue IDs and styling. Returns [] for empty or non-VTT input.
 */
export function parseWebVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Some payloads carry a literal "\n" (backslash + n) instead of a newline.
  const blocks = vtt
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const timingIndex = lines.findIndex((line) => CUE_TIMING.test(line));
    if (timingIndex === -1) continue;

    const [start, end] = lines[timingIndex]!.split("-->").map(
      (part) => part.trim().split(/\s/)[0]!,
    );
    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) segments.push({ startMs: vttTimeToMs(start!), endMs: vttTimeToMs(end!), text });
  }
  return segments;
}

function vttTimeToMs(time: string): number {
  const parts = time.replace(",", ".").split(":").map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  return Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000);
}
