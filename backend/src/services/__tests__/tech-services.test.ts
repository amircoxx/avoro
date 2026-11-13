import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  techProfile: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn()
  },
  techLocation: { upsert: vi.fn() },
  techService: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn()
  },
  referral: { create: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import {
  createOwnService,
  listOwnServices,
  updateOwnService
} from "../tech-service.service";
import { upsertTechProfile } from "../tech-profile.service";
import { toPublicTechProfile } from "../shared/marketplace";
import { techProfileInputSchema } from "../../validations/tech-profile.schema";
import { techServiceWriteSchema } from "../../validations/schedule.schema";

const service = {
  id: "service-1",
  techProfileId: "tech-1",
  name: "Gel-X Full Set",
  description: "Prep and shaping",
  durationMinutes: 90,
  startingPriceCents: 8500,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("owned tech services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a tech profile before listing services", async () => {
    prisma.techProfile.findUnique.mockResolvedValue(null);

    await expect(listOwnServices("user-1")).rejects.toMatchObject({
      status: 409,
      code: "missing_tech_profile"
    });
  });

  it("lists active and inactive services owned by the tech", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techService.findMany.mockResolvedValue([service, { ...service, id: "service-2", isActive: false }]);

    await expect(listOwnServices("user-1")).resolves.toEqual([
      {
        id: "service-1",
        name: "Gel-X Full Set",
        description: "Prep and shaping",
        durationMinutes: 90,
        startingPriceCents: 8500,
        isActive: true
      },
      expect.objectContaining({ id: "service-2", isActive: false })
    ]);
  });

  it("preserves nullable legacy duration and price in the owner DTO", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techService.findMany.mockResolvedValue([
      { ...service, id: "missing-duration", durationMinutes: null },
      { ...service, id: "missing-price", startingPriceCents: null }
    ]);

    await expect(listOwnServices("user-1")).resolves.toEqual([
      expect.objectContaining({ id: "missing-duration", durationMinutes: null, startingPriceCents: 8500 }),
      expect.objectContaining({ id: "missing-price", durationMinutes: 90, startingPriceCents: null })
    ]);
  });

  it("requires name, duration, and price when creating a service", () => {
    expect(techServiceWriteSchema.safeParse({ name: "Gel-X", startingPriceCents: 8500 }).success).toBe(false);
    expect(techServiceWriteSchema.safeParse({ name: "Gel-X", durationMinutes: 90 }).success).toBe(false);
    expect(techServiceWriteSchema.safeParse({ durationMinutes: 90, startingPriceCents: 8500 }).success).toBe(false);
  });

  it("creates a service with the stable DTO shape", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techService.create.mockResolvedValue(service);

    const result = await createOwnService("user-1", {
      name: "Gel-X Full Set",
      description: "Prep and shaping",
      durationMinutes: 90,
      startingPriceCents: 8500,
      isActive: true
    });

    expect(result).toEqual({
      id: "service-1",
      name: "Gel-X Full Set",
      description: "Prep and shaping",
      durationMinutes: 90,
      startingPriceCents: 8500,
      isActive: true
    });
  });

  it("cannot update another tech's service", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techService.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateOwnService("user-1", "another-tech-service", {
      name: "Gel-X Full Set",
      description: "Prep and shaping",
      durationMinutes: 90,
      startingPriceCents: 8500,
      isActive: true
    })).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(prisma.techService.updateMany).toHaveBeenCalledWith({
      where: { id: "another-tech-service", techProfileId: "tech-1" },
      data: expect.any(Object)
    });
  });

  it("deactivates a service without deleting its row", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techService.updateMany.mockResolvedValue({ count: 1 });
    prisma.techService.findFirst.mockResolvedValue({ ...service, isActive: false });

    await expect(updateOwnService("user-1", "service-1", {
      name: "Gel-X Full Set",
      description: "Prep and shaping",
      durationMinutes: 90,
      startingPriceCents: 8500,
      isActive: false
    })).resolves.toEqual(expect.objectContaining({ id: "service-1", isActive: false }));
    expect(prisma.techService.deleteMany).not.toHaveBeenCalled();
  });
});

describe("tech profile service persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it("does not replace existing services when saving profile details", async () => {
    const profile = profileRecord();
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1", referralCode: "GLOSS-1" });
    prisma.techProfile.upsert.mockResolvedValue(profile);
    prisma.techLocation.upsert.mockResolvedValue({});
    prisma.techProfile.findUniqueOrThrow.mockResolvedValue(profile);

    const input = techProfileInputSchema.parse({
      businessName: "Gloss Room",
      displayName: "Mia",
      instagramUrl: "",
      tiktokUrl: "",
      location: {
        city: "Charlotte",
        state: "NC",
        latitude: 35.2,
        longitude: -80.8,
        publicLocationLabel: "Charlotte, NC"
      },
      services: [{ name: "Legacy service" }],
      bookingUrl: "https://legacy-booking.example.com"
    });

    await upsertTechProfile("user-1", input);

    expect(prisma.techService.deleteMany).not.toHaveBeenCalled();
  });
});

describe("public service visibility", () => {
  it("exposes only active services and no external booking URL", () => {
    const result = toPublicTechProfile({
      ...profileRecord(),
      bookingUrl: "https://legacy-booking.example.com",
      services: [service, { ...service, id: "inactive-service", isActive: false }]
    });

    expect(result).toMatchObject({ bookingEnabled: false, bookingTimeZone: null });
    expect(result).not.toHaveProperty("bookingUrl");
    expect(result.services).toEqual([
      {
        id: "service-1",
        name: "Gel-X Full Set",
        description: "Prep and shaping",
        durationMinutes: 90,
        startingPriceCents: 8500
      }
    ]);
  });

  it("exposes the configured booking timezone with an enabled public profile", () => {
    const result = toPublicTechProfile({
      ...profileRecord(),
      scheduleSettings: { id: "settings-1", timeZone: "America/New_York" },
      weeklyAvailability: [{ id: "window-1" }],
      services: [service]
    });

    expect(result).toMatchObject({ bookingEnabled: true, bookingTimeZone: "America/New_York" });
  });

  it("fails booking closed for active legacy services that are missing duration or price", () => {
    const result = toPublicTechProfile({
      ...profileRecord(),
      scheduleSettings: { id: "settings-1", timeZone: "America/New_York" },
      weeklyAvailability: [{ id: "window-1" }],
      services: [
        { ...service, id: "missing-duration", durationMinutes: null },
        { ...service, id: "missing-price", startingPriceCents: null }
      ]
    });

    expect(result.bookingEnabled).toBe(false);
    expect(result.services).toEqual([
      expect.objectContaining({ id: "missing-duration", durationMinutes: null, startingPriceCents: 8500 }),
      expect.objectContaining({ id: "missing-price", durationMinutes: 90, startingPriceCents: null })
    ]);
  });
});

function profileRecord() {
  return {
    id: "tech-1", userId: "user-1", businessName: "Gloss Room", displayName: "Mia", bio: null, phone: null,
    email: null, instagramUrl: null, tiktokUrl: null, bookingUrl: null, profileImageUrl: null, specialties: [],
    isPublished: false, referralCode: "GLOSS-1", referredByCode: null, referralCount: 0, averageRating: 0,
    reviewCount: 0, createdAt: new Date(), updatedAt: new Date(),
    location: {
      id: "location-1", techProfileId: "tech-1", privateAddressLine1: null, privateAddressLine2: null,
      city: "Charlotte", state: "NC", postalCode: null, country: "US", latitude: 35.2, longitude: -80.8,
      publicLocationLabel: "Charlotte, NC", locationVisibility: "CITY_ONLY" as const, publicRadiusMiles: 5,
      createdAt: new Date(), updatedAt: new Date()
    },
    services: [], profileMedia: [], reviews: []
  };
}
