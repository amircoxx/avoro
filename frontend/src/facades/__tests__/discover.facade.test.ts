import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSavedTechs: vi.fn(),
  getFeaturedTechs: vi.fn(),
  mapTechProfileToArtist: vi.fn(),
  removeSavedTech: vi.fn(),
  saveTech: vi.fn(),
  searchTechs: vi.fn()
}));

vi.mock("@/services/api", () => api);

import { loadSavedTechIds, toggleSavedTech } from "../discover.facade";

describe("discover facade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads saved tech ids for the already-resolved shared customer", async () => {
    const customer = { id: "customer-1", role: "CUSTOMER" as const, email: "avery@example.com", fullName: "Avery", avatarUrl: null };
    api.getSavedTechs.mockResolvedValue([{ id: "tech-1" }]);

    await expect(loadSavedTechIds(customer)).resolves.toEqual(new Set(["tech-1"]));
    await expect(loadSavedTechIds(null)).resolves.toEqual(new Set());
    expect(api.getSavedTechs).toHaveBeenCalledTimes(1);
  });

  it("uses remove for an already saved tech", async () => {
    api.removeSavedTech.mockResolvedValue({ saved: false });

    await expect(toggleSavedTech("tech-1", true)).resolves.toEqual({ saved: false });
    expect(api.removeSavedTech).toHaveBeenCalledWith("tech-1");
  });
});
