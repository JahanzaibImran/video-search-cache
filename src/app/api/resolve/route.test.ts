import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { ApiErrorResponse, ResolveResponse } from "@/lib/api/types";
import { server } from "@/test/msw/server";
import { apiRequest, setupApp } from "@/test/routes";
import { GET } from "./route";

const resolve = (url: string) =>
  GET(apiRequest(`/api/resolve?url=${encodeURIComponent(url)}`, { userId: "alice" }));

describe("GET /api/resolve", () => {
  it("turns a YouTube Shorts link into a video reference, free", async () => {
    setupApp();
    const response = await resolve("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share");
    const body = (await response.json()) as ResolveResponse;

    expect(response.status).toBe(200);
    expect(body.ref).toEqual({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  it("resolves a TikTok short link by following its redirect", async () => {
    setupApp();
    server.use(
      http.get(
        "https://vm.tiktok.com/ZMabc123/",
        () =>
          new HttpResponse(null, {
            status: 301,
            headers: { Location: "https://www.tiktok.com/@a/video/7499229683859426602?_r=1" },
          }),
      ),
    );

    const body = (await (
      await resolve("https://vm.tiktok.com/ZMabc123/")
    ).json()) as ResolveResponse;

    expect(body.ref).toEqual({ platform: "tiktok", id: "7499229683859426602" });
  });

  it("rejects something that isn't a video link with 400", async () => {
    setupApp();
    const response = await resolve("https://example.com/watch?v=dQw4w9WgXcQ");

    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe("INVALID_INPUT");
  });
});
