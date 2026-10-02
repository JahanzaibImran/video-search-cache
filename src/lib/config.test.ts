import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { ConfigError } from "./errors";

describe("loadConfig", () => {
  it("reads the API key and credit limit", () => {
    expect(loadConfig({ YOUTUBE_API_KEY: "abc", CREDIT_LIMIT: "5" })).toEqual({
      youtubeApiKey: "abc",
      creditLimit: 5,
      youtubeApiBaseUrl: undefined,
    });
  });

  it("treats a missing or blank API key as not configured instead of throwing", () => {
    expect(loadConfig({}).youtubeApiKey).toBeNull();
    expect(loadConfig({ YOUTUBE_API_KEY: "   " }).youtubeApiKey).toBeNull();
  });

  it("defaults the credit limit to 20 when unset or blank", () => {
    expect(loadConfig({}).creditLimit).toBe(20);
    expect(loadConfig({ CREDIT_LIMIT: "" }).creditLimit).toBe(20);
  });

  it("rejects a credit limit that isn't a non-negative integer", () => {
    expect(() => loadConfig({ CREDIT_LIMIT: "lots" })).toThrow(ConfigError);
    expect(() => loadConfig({ CREDIT_LIMIT: "-1" })).toThrow(/CREDIT_LIMIT/);
  });

  it("accepts an optional API base URL override and rejects a malformed one", () => {
    expect(loadConfig({ YOUTUBE_API_BASE_URL: "http://localhost:4100" }).youtubeApiBaseUrl).toBe(
      "http://localhost:4100",
    );
    expect(() => loadConfig({ YOUTUBE_API_BASE_URL: "not a url" })).toThrow(ConfigError);
  });
});
