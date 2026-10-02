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
    expect(cacheKeys.search("React Hooks")).toBe(cacheKeys.search("  react   hooks "));
    expect(cacheKeys.search("React Hooks")).toBe("yt:search:react hooks");
  });

  it("keeps different queries distinct", () => {
    expect(cacheKeys.search("react hooks")).not.toBe(cacheKeys.search("react hook"));
  });

  it("builds video and comment keys without altering case-sensitive IDs", () => {
    expect(cacheKeys.video("dQw4w9WgXcQ")).toBe("yt:video:dQw4w9WgXcQ");
    expect(cacheKeys.comments("dQw4w9WgXcQ")).toBe("yt:comments:dQw4w9WgXcQ");
  });
});
