import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format";
import { msToIsoDuration, parseWebVtt, unixToIso } from "./convert";

describe("msToIsoDuration", () => {
  it.each([
    [173_675, "PT2M54S", "2:54"],
    [44_000, "PT44S", "0:44"],
    [3_600_000, "PT1H", "1:00:00"],
    [3_723_000, "PT1H2M3S", "1:02:03"],
    [0, "PT0S", "0:00"],
  ])("%d ms -> %s (displayed as %s)", (ms, iso, display) => {
    expect(msToIsoDuration(ms)).toBe(iso);
    expect(formatDuration(iso)).toBe(display);
  });
});

describe("unixToIso", () => {
  it("converts seconds and rejects missing or invalid values", () => {
    expect(unixToIso(1750214725)).toBe("2025-06-18T02:45:25.000Z");
    expect(unixToIso(null)).toBeNull();
    expect(unixToIso(undefined)).toBeNull();
    expect(unixToIso(0)).toBeNull();
  });
});

describe("parseWebVtt", () => {
  it("extracts timed cues from TikTok's WEBVTT", () => {
    const vtt =
      "WEBVTT\n\n\n00:00:00.120 --> 00:00:01.840\nAlright, pizza review time.\n\n" +
      "00:00:01.841 --> 00:00:03.761\nSal's Pizza Factory.\\n";

    expect(parseWebVtt(vtt)).toEqual([
      { startMs: 120, endMs: 1840, text: "Alright, pizza review time." },
      { startMs: 1841, endMs: 3761, text: "Sal's Pizza Factory." },
    ]);
  });

  it("handles cue IDs, multi-line cues, mm:ss timings, CRLF and inline tags", () => {
    const vtt =
      "WEBVTT\r\n\r\n1\r\n00:05.000 --> 00:07.500 align:start\r\n<b>Hello</b>\r\nworld\r\n";

    expect(parseWebVtt(vtt)).toEqual([{ startMs: 5000, endMs: 7500, text: "Hello world" }]);
  });

  it("returns [] for empty or non-VTT input", () => {
    expect(parseWebVtt("")).toEqual([]);
    expect(parseWebVtt("WEBVTT\n\n")).toEqual([]);
    expect(parseWebVtt("just some text")).toEqual([]);
  });
});
