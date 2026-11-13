import { describe, expect, it } from "vitest";
import { shouldAvoidBackgroundUpscale } from "../background-hero";

describe("shouldAvoidBackgroundUpscale", () => {
  it("uses the contained fallback when a legacy background is narrower than its rendered hero", () => {
    expect(shouldAvoidBackgroundUpscale(800, 450, 1280, 320)).toBe(true);
  });

  it("keeps a sufficiently large background in cover mode", () => {
    expect(shouldAvoidBackgroundUpscale(1584, 396, 1584, 396)).toBe(false);
  });

  it("avoids enlarging a LinkedIn-sized banner on a wider screen", () => {
    expect(shouldAvoidBackgroundUpscale(1584, 396, 1920, 480)).toBe(true);
  });
});
