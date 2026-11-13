import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  techProfile: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  savedTech: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn()
  }
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import {
  listSavedTechsForCustomer,
  removeSavedTechForCustomer,
  saveTechForCustomer
} from "../saved-tech.service";
import { getFeaturedTechs } from "../tech-search.service";
import { getPublicTechProfile } from "../tech-profile.service";

const publishedProfile = {
  id: "tech-1",
  businessName: "Gloss Room",
  displayName: "Mia",
  bio: null,
  phone: null,
  email: null,
  instagramUrl: null,
  tiktokUrl: null,
  bookingUrl: null,
  profileImageUrl: null,
  specialties: ["Gel-X"],
  averageRating: 5,
  reviewCount: 1,
  isPublished: true,
  referralCode: "GLOSS-1",
  userId: "owner-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  referredByCode: null,
  location: {
    id: "location-1",
    techProfileId: "tech-1",
    privateAddressLine1: null,
    privateAddressLine2: null,
    city: "Charlotte",
    state: "NC",
    postalCode: null,
    country: "US",
    latitude: 35.2,
    longitude: -80.8,
    publicLocationLabel: "Charlotte, NC",
    locationVisibility: "CITY_ONLY",
    publicRadiusMiles: 5,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  services: [],
  portfolioImages: [],
  reviews: []
};

describe("saved techs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores one save for the authenticated customer and published profile", async () => {
    prisma.techProfile.findFirst.mockResolvedValue({ id: "tech-1" });
    prisma.savedTech.upsert.mockResolvedValue({});

    await expect(saveTechForCustomer("customer-1", "tech-1")).resolves.toEqual({ saved: true });
    expect(prisma.savedTech.upsert).toHaveBeenCalledWith({
      where: { customerId_techProfileId: { customerId: "customer-1", techProfileId: "tech-1" } },
      update: {},
      create: { customerId: "customer-1", techProfileId: "tech-1" }
    });
  });

  it("returns not_found instead of saving an unpublished profile", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(null);

    await expect(saveTechForCustomer("customer-1", "missing")).rejects.toMatchObject({
      status: 404,
      code: "not_found"
    });
  });

  it("removes only the authenticated customer's save", async () => {
    prisma.savedTech.deleteMany.mockResolvedValue({ count: 1 });

    await expect(removeSavedTechForCustomer("customer-1", "tech-1")).resolves.toEqual({ saved: false });
    expect(prisma.savedTech.deleteMany).toHaveBeenCalledWith({
      where: { customerId: "customer-1", techProfileId: "tech-1" }
    });
  });

  it("maps only the current customer's saved profiles", async () => {
    prisma.savedTech.findMany.mockResolvedValue([{ techProfile: publishedProfile }]);

    await expect(listSavedTechsForCustomer("customer-1")).resolves.toMatchObject([
      { id: "tech-1", businessName: "Gloss Room" }
    ]);
    expect(prisma.savedTech.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: "customer-1" },
      orderBy: { createdAt: "desc" }
    }));
  });

  it("includes saved state when the profile is loaded by a customer", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(publishedProfile);
    prisma.savedTech.findFirst.mockResolvedValue({ customerId: "customer-1" });

    await expect(getPublicTechProfile("tech-1", "customer-1")).resolves.toMatchObject({
      id: "tech-1",
      isSaved: true
    });
    expect(prisma.savedTech.findFirst).toHaveBeenCalledWith({
      where: { customerId: "customer-1", techProfileId: "tech-1" },
      select: { customerId: true }
    });
  });

  it("returns reviewed published profiles ordered by review count, then rating", async () => {
    prisma.techProfile.findMany.mockResolvedValue([publishedProfile]);

    await expect(getFeaturedTechs(6)).resolves.toMatchObject([
      { id: "tech-1", reviewCount: 1, averageRating: 5 }
    ]);
    expect(prisma.techProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isPublished: true, reviewCount: { gt: 0 } },
      orderBy: [
        { reviewCount: "desc" },
        { averageRating: "desc" },
        { createdAt: "desc" }
      ],
      take: 6
    }));
  });
});
