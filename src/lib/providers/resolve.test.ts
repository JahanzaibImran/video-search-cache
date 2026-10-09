import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { server } from "@/test/msw/server";
import { resolveVideoInput } from "./resolve";

const TT = "7499229683859426602";
const redirect = (to: string) => new HttpResponse(null, { status: 301, headers: { Location: to } });

describe("resolveVideoInput", () => {
  it("parses full URLs offline, without any request", async () => {
    // No handler is registered for these hosts: a request would fail the test.
    await expect(resolveVideoInput("https://youtu.be/dQw4w9WgXcQ")).resolves.toEqual({
      platform: "youtube",
      id: "dQw4w9WgXcQ",
    });
  });

  it("follows a TikTok short link's redirect to the video", async () => {
    server.use(
      http.get("https://vm.tiktok.com/ZMabc123/", () =>
        redirect(`https://www.tiktok.com/@stoolpresidente/video/${TT}?_r=1&_t=xyz`),
      ),
    );

    await expect(resolveVideoInput("https://vm.tiktok.com/ZMabc123/")).resolves.toEqual({
      platform: "tiktok",
      id: TT,
    });
  });

  it("follows a short chain of TikTok redirects", async () => {
    server.use(
      http.get("https://vt.tiktok.com/ZSxyz/", () => redirect("https://www.tiktok.com/t/ZTRabc/")),
      http.get("https://www.tiktok.com/t/ZTRabc/", () =>
        redirect(`https://m.tiktok.com/v/${TT}.html`),
      ),
    );

    await expect(resolveVideoInput("vt.tiktok.com/ZSxyz/")).resolves.toEqual({
      platform: "tiktok",
      id: TT,
    });
  });

  it("refuses to follow a redirect away from tiktok.com (no SSRF)", async () => {
    server.use(
      http.get("https://vm.tiktok.com/ZMevil/", () =>
        redirect("http://169.254.169.254/latest/meta-data"),
      ),
    );

    await expect(resolveVideoInput("https://vm.tiktok.com/ZMevil/")).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it("rejects text that isn't a supported link", async () => {
    await expect(resolveVideoInput("https://example.com/video/1")).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(resolveVideoInput("react hooks")).rejects.toBeInstanceOf(InvalidInputError);
  });
});
