import { describe, expect, it } from "vitest";
import { cacheKeys, normalizeQuery } from "./keys";

describe("normalizeQuery", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeQuery("  React \t  Hooks \n")).toBe("react hooks");
  });

  it("applies Unicode normalisation so full-width characters fold to ASCII", () => {
    const fullWidthReact = "ＲＥＡＣＴ";
    expect(normalizeQuery(fullWidthReact)).toBe("react");
  });
});

describe("cacheKeys", () => {
  it('maps "React Hooks" and "  react   hooks " to the same search key', () => {
    expect(cacheKeys.search("youtube", "React Hooks")).toBe(
      cacheKeys.search("youtube", "  react   hooks "),
    );
    expect(cacheKeys.search("youtube", "React Hooks")).toBe("youtube:search:react hooks");
  });

  it("keeps different queries distinct", () => {
    expect(cacheKeys.search("youtube", "react hooks")).not.toBe(
      cacheKeys.search("youtube", "react hook"),
    );
  });

  it("keeps the same query on different platforms distinct", () => {
    expect(cacheKeys.search("youtube", "cats")).toBe("youtube:search:cats");
    expect(cacheKeys.search("tiktok", "cats")).toBe("tiktok:search:cats");
  });

  it("builds {platform}:{type}:{id} keys without altering case-sensitive IDs", () => {
    const ref = { platform: "youtube", id: "dQw4w9WgXcQ" } as const;
    expect(cacheKeys.video(ref)).toBe("youtube:video:dQw4w9WgXcQ");
    expect(cacheKeys.comments(ref)).toBe("youtube:comments:dQw4w9WgXcQ");
    expect(cacheKeys.transcript(ref)).toBe("youtube:transcript:dQw4w9WgXcQ");
    expect(cacheKeys.video({ platform: "tiktok", id: "7499229683859426602" })).toBe(
      "tiktok:video:7499229683859426602",
    );
  });
});
