import { describe, expect, it } from "vitest";
import { cacheKeys } from "@/lib/cache";
import { canonicalVideoUrl, isTikTokShortLink, looksLikeUrl, parseVideoUrl } from "./urls";

const YT = "dQw4w9WgXcQ";
const TT = "7499229683859426602";

describe("parseVideoUrl: YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}`,
    `http://www.youtube.com/watch?v=${YT}`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://music.youtube.com/watch?v=${YT}`,
    `https://www.youtube.com/watch?v=${YT}&t=42s`,
    `https://www.youtube.com/watch?list=PL123&v=${YT}&index=3`,
    `https://www.youtube.com/watch?feature=share&v=${YT}`,
    `https://youtu.be/${YT}`,
    `https://youtu.be/${YT}?si=AbCdEf123&t=10`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://youtube.com/shorts/${YT}?feature=share`,
    `https://www.youtube.com/embed/${YT}`,
    `https://www.youtube-nocookie.com/embed/${YT}`,
    `https://www.youtube.com/live/${YT}`,
    `youtube.com/watch?v=${YT}`,
    `www.youtube.com/shorts/${YT}`,
    `youtu.be/${YT}`,
    `  https://youtu.be/${YT}  `,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${YT}`,
  ])("%s -> youtube:%s", (input) => {
    expect(parseVideoUrl(input)).toEqual({ platform: "youtube", id: YT });
  });

  it("keeps the ID's case exactly (YouTube IDs are case-sensitive)", () => {
    expect(parseVideoUrl("https://youtu.be/AbCdEfGhIjK")?.id).toBe("AbCdEfGhIjK");
    expect(parseVideoUrl("https://youtu.be/abcdefghijk")?.id).toBe("abcdefghijk");
  });

  it.each([
    ["no video param", "https://www.youtube.com/watch"],
    ["ID too short", "https://youtu.be/abc"],
    ["ID too long", `https://youtu.be/${YT}X`],
    ["ID with invalid characters", "https://youtu.be/dQw4w9WgX!Q"],
    ["channel page", "https://www.youtube.com/@mkbhd"],
    ["playlist only", "https://www.youtube.com/playlist?list=PL123"],
    ["look-alike domain", `https://youtube.com.evil.example/watch?v=${YT}`],
    ["different domain", `https://notyoutube.com/watch?v=${YT}`],
  ])("rejects %s", (_label, input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});

describe("parseVideoUrl: TikTok", () => {
  it.each([
    `https://www.tiktok.com/@stoolpresidente/video/${TT}`,
    `https://tiktok.com/@stoolpresidente/video/${TT}`,
    `https://m.tiktok.com/@stoolpresidente/video/${TT}`,
    `https://www.tiktok.com/@stoolpresidente/video/${TT}?is_from_webapp=1&sender_device=pc`,
    `https://www.tiktok.com/@stoolpresidente/video/${TT}?_r=1&_t=8abc`,
    `https://www.tiktok.com/@someone.else/video/${TT}`,
    `https://www.tiktok.com/@stoolpresidente/photo/${TT}`,
    `https://m.tiktok.com/v/${TT}.html`,
    `https://www.tiktok.com/embed/v2/${TT}`,
    `https://www.tiktok.com/embed/${TT}`,
    `tiktok.com/@stoolpresidente/video/${TT}`,
  ])("%s -> tiktok:%s", (input) => {
    expect(parseVideoUrl(input)).toEqual({ platform: "tiktok", id: TT });
  });

  it.each([
    ["profile page", "https://www.tiktok.com/@stoolpresidente"],
    ["non-numeric ID", "https://www.tiktok.com/@user/video/abc123"],
    ["missing ID", "https://www.tiktok.com/@user/video/"],
    ["short link (needs a redirect to resolve)", "https://vm.tiktok.com/ZMabc123/"],
  ])("rejects %s", (_label, input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});

describe("parseVideoUrl: not a video URL", () => {
  it.each([
    "react hooks",
    "",
    "   ",
    "https://",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
  ])("%j -> null", (input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});

describe("one video, one cache key", () => {
  it("every YouTube URL form for the same video produces the same cache key", () => {
    const forms = [
      `https://www.youtube.com/watch?v=${YT}&t=42s`,
      `https://youtu.be/${YT}?si=xyz`,
      `https://www.youtube.com/shorts/${YT}`,
      `https://m.youtube.com/watch?v=${YT}`,
    ];
    const keys = new Set(forms.map((form) => cacheKeys.video(parseVideoUrl(form)!)));
    expect([...keys]).toEqual([`youtube:video:${YT}`]);
  });

  it("every TikTok URL form for the same video produces the same cache key", () => {
    const forms = [
      `https://www.tiktok.com/@a/video/${TT}?is_from_webapp=1`,
      `https://m.tiktok.com/v/${TT}.html`,
      `https://www.tiktok.com/embed/v2/${TT}`,
    ];
    const keys = new Set(forms.map((form) => cacheKeys.comments(parseVideoUrl(form)!)));
    expect([...keys]).toEqual([`tiktok:comments:${TT}`]);
  });

  it("the same ID on different platforms never collides", () => {
    // Not realistic (ID formats differ), but the key must still carry the platform.
    expect(cacheKeys.video({ platform: "youtube", id: "x" })).not.toBe(
      cacheKeys.video({ platform: "tiktok", id: "x" }),
    );
  });
});

describe("isTikTokShortLink", () => {
  it.each([
    "https://vm.tiktok.com/ZMabc123/",
    "https://vt.tiktok.com/ZSxyz789/",
    "https://www.tiktok.com/t/ZTRabc123/",
    "vm.tiktok.com/ZMabc123",
  ])("%s is a short link", (input) => {
    expect(isTikTokShortLink(input)).toBe(true);
  });

  it.each([
    `https://www.tiktok.com/@a/video/${TT}`,
    "https://vm.tiktok.com/",
    "https://youtu.be/x",
  ])("%s is not", (input) => {
    expect(isTikTokShortLink(input)).toBe(false);
  });
});

describe("looksLikeUrl", () => {
  it("tells links from search phrases", () => {
    expect(looksLikeUrl(`https://youtu.be/${YT}`)).toBe(true);
    expect(looksLikeUrl(`youtu.be/${YT}`)).toBe(true);
    expect(looksLikeUrl("vm.tiktok.com/ZMabc")).toBe(true);
    expect(looksLikeUrl("how to use youtube.com")).toBe(false);
    expect(looksLikeUrl("react hooks")).toBe(false);
  });
});

describe("canonicalVideoUrl", () => {
  it("builds the watch URL providers expect", () => {
    expect(canonicalVideoUrl({ platform: "youtube", id: YT })).toBe(
      `https://www.youtube.com/watch?v=${YT}`,
    );
    expect(canonicalVideoUrl({ platform: "tiktok", id: TT })).toBe(
      `https://www.tiktok.com/@/video/${TT}`,
    );
  });

  it("round-trips: a canonical URL parses back to the same ref", () => {
    for (const ref of [
      { platform: "youtube", id: YT },
      { platform: "tiktok", id: TT },
    ] as const) {
      expect(parseVideoUrl(canonicalVideoUrl(ref))).toEqual(ref);
    }
  });
});
