import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTechProfile: vi.fn(),
  mapTechProfileToArtist: vi.fn(),
  submitReview: vi.fn(),
  removeSavedTech: vi.fn(),
  saveTech: vi.fn()
}));

vi.mock("@/services/api", () => api);

import { loadArtistProfile, submitArtistReview } from "../artist-profile.facade";

describe("artist profile facade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a profile once and returns its mapped artist and saved state", async () => {
    const profile = { id: "tech-1", isSaved: true };
    const artist = { name: "Mia" };
    api.getTechProfile.mockResolvedValue(profile);
    api.mapTechProfileToArtist.mockReturnValue(artist);

    await expect(loadArtistProfile("tech-1")).resolves.toEqual({ profile, artist, isSaved: true });
    expect(api.getTechProfile).toHaveBeenCalledTimes(1);
    expect(api.mapTechProfileToArtist).toHaveBeenCalledWith(profile, 0);
  });

  it("submits a review then reloads the mapped profile", async () => {
    const profile = { id: "tech-1", isSaved: false };
    const artist = { name: "Mia" };
    api.getTechProfile.mockResolvedValue(profile);
    api.mapTechProfileToArtist.mockReturnValue(artist);

    await expect(submitArtistReview("tech-1", { rating: 5, comment: "Great" })).resolves.toEqual({ profile, artist });
    expect(api.submitReview).toHaveBeenCalledWith("tech-1", { rating: 5, comment: "Great" });
  });
});
