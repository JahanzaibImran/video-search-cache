import { describe, expect, it } from "vitest";
import { formatAge, formatCompactNumber, formatDate, formatDuration } from "./format";

describe("format helpers", () => {
  it("formats dates in UTC", () => {
    expect(formatDate("2024-01-15T23:30:00Z")).toBe("Jan 15, 2024");
    expect(formatDate("not a date")).toBe("");
  });

  it("formats compact numbers", () => {
    expect(formatCompactNumber(950)).toBe("950");
    expect(formatCompactNumber(123456)).toBe("123.5K");
    expect(formatCompactNumber(2_000_000)).toBe("2M");
  });

  it.each([
    ["PT10M3S", "10:03"],
    ["PT45S", "0:45"],
    ["PT1H2M", "1:02:00"],
    ["P1DT1S", "24:00:01"],
    ["garbage", null],
  ])("formats duration %s as %s", (iso, expected) => {
    expect(formatDuration(iso)).toBe(expected);
  });

  it("formats ages relative to now", () => {
    const now = Date.parse("2024-01-01T12:00:00Z");
    expect(formatAge("2024-01-01T11:59:30Z", now)).toBe("just now");
    expect(formatAge("2024-01-01T11:55:00Z", now)).toBe("5 min ago");
    expect(formatAge("2024-01-01T09:00:00Z", now)).toBe("3 h ago");
    expect(formatAge("2023-12-30T12:00:00Z", now)).toBe("2 d ago");
  });
});
