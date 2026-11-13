import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileMedia } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = vi.hoisted(() => ({
  techProfile: { findUnique: vi.fn() },
  profileMedia: {
    count: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn()
  },
  $executeRawUnsafe: vi.fn(),
  $transaction: vi.fn()
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import { createPortfolioUploadRecord } from "../referrals.service";
import { groupProfileMedia, toProfileMediaDto, toPublicTechProfile } from "../shared/marketplace";
import { deleteProfileMedia, saveProfileMedia } from "../profile-media.service";
import { profileMediaUploadInputSchema, signUploadInputSchema } from "../../validations/upload.schema";

const records: ProfileMedia[] = [
  media({ id: "profile", role: "PROFILE", imageDataUrl: "data:image/png;base64,AA==" }),
  media({ id: "background", role: "BACKGROUND", imageDataUrl: "data:image/png;base64,BB==", altText: "Studio" }),
  media({ id: "gallery", role: "GALLERY", imageDataUrl: "data:image/png;base64,CC==", altText: "Gel set", sortOrder: 2 })
];

const validUpload = {
  fileName: "photo.png",
  contentType: "image/png" as const,
  fileSizeBytes: 1,
  fileDataUrl: "data:image/png;base64,AA=="
};

describe("profile media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.profileMedia.findMany.mockResolvedValue(records);
  });

  it("maps stored media to the profile-media DTO contract", () => {
    const mediaRecord = media({
      id: "media-1",
      role: "GALLERY",
      imageDataUrl: "data:image/png;base64,AA==",
      altText: "Gel set",
      sortOrder: 3
    });

    expect(toProfileMediaDto(mediaRecord)).toEqual({
      id: mediaRecord.id,
      imageUrl: mediaRecord.imageDataUrl,
      altText: mediaRecord.altText,
      sortOrder: mediaRecord.sortOrder
    });
  });

  it("groups profile, background, and gallery records independently", () => {
    expect(groupProfileMedia(records)).toEqual({
      profileImage: { id: "profile", imageUrl: "data:image/png;base64,AA==", altText: null, sortOrder: 0 },
      backgroundImage: { id: "background", imageUrl: "data:image/png;base64,BB==", altText: "Studio", sortOrder: 0 },
      galleryImages: [{ id: "gallery", imageUrl: "data:image/png;base64,CC==", altText: "Gel set", sortOrder: 2 }]
    });
    expect(groupProfileMedia(records).galleryImages).toHaveLength(1);
  });

  it("accepts only supported profile media roles", () => {
    expect(() => profileMediaUploadInputSchema.parse({ ...validUpload, role: "video" })).toThrow();
    expect(profileMediaUploadInputSchema.parse({ ...validUpload, role: "gallery" }).role).toBe("gallery");
  });

  it("preserves the legacy signing schema's declared-size contract", () => {
    expect(signUploadInputSchema.safeParse({
      fileName: validUpload.fileName,
      contentType: validUpload.contentType,
      fileSizeBytes: validUpload.fileSizeBytes
    }).success).toBe(true);
    expect(signUploadInputSchema.safeParse({ ...validUpload, fileSizeBytes: 2 }).success).toBe(true);
    expect(signUploadInputSchema.safeParse({
      ...validUpload,
      fileDataUrl: "data:image/png;base64,%%%="
    }).success).toBe(true);
  });

  it("requires encoded image bytes for direct profile media uploads", () => {
    const result = profileMediaUploadInputSchema.safeParse({
      fileName: validUpload.fileName,
      contentType: validUpload.contentType,
      fileSizeBytes: validUpload.fileSizeBytes,
      role: "profile"
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.fileDataUrl).toBeDefined();
  });

  it.each([
    {
      name: "malformed base64",
      input: { ...validUpload, fileDataUrl: "data:image/png;base64,%%%=" }
    },
    {
      name: "a decoded-size mismatch",
      input: { ...validUpload, fileSizeBytes: 2 }
    },
    {
      name: "decoded content over 10 MiB",
      input: {
        ...validUpload,
        fileSizeBytes: 10 * 1024 * 1024,
        fileDataUrl: `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64")}`
      }
    }
  ])("rejects $name instead of trusting the declared upload size", ({ input }) => {
    const result = profileMediaUploadInputSchema.safeParse({ ...input, role: "profile" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.fileDataUrl).toBeDefined();
  });

  it("keeps duplicate legacy sort orders schema-compatible", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schema).not.toContain("@@unique([techProfileId, role, sortOrder])");
  });

  it("maps role-aware media onto public profiles without a legacy portfolio field", () => {
    const result = toPublicTechProfile({
      id: "tech", userId: "user", businessName: "Studio", displayName: "Mia", bio: null, phone: null,
      email: null, instagramUrl: null, tiktokUrl: null, bookingUrl: null, profileImageUrl: "legacy.png",
      specialties: [], isPublished: true, referralCode: "STUDIO-1", referredByCode: null, referralCount: 0, averageRating: 0,
      reviewCount: 0, createdAt: new Date(), updatedAt: new Date(),
      location: { id: "location", techProfileId: "tech", privateAddressLine1: null, privateAddressLine2: null,
        city: "Charlotte", state: "NC", postalCode: null, country: "US", latitude: 1, longitude: 2,
        publicLocationLabel: "Charlotte, NC", locationVisibility: "CITY_ONLY", publicRadiusMiles: 5,
        createdAt: new Date(), updatedAt: new Date() },
      services: [], profileMedia: records, reviews: []
    });

    expect(result).toMatchObject({
      profileImage: { id: "profile" },
      backgroundImage: { id: "background" },
      galleryImages: [{ id: "gallery" }]
    });
    expect(result).not.toHaveProperty("portfolioImages");
    expect(result).not.toHaveProperty("profileImageUrl");
  });

  it("replaces an existing singleton role when profile media is saved", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.deleteMany.mockResolvedValue({ count: 1 });
    prisma.profileMedia.create.mockResolvedValue(records[0]);

    await expect(saveProfileMedia("user", { ...validUpload, role: "profile" })).resolves.toEqual({
      profileImage: expect.objectContaining({ id: "profile" }),
      backgroundImage: expect.objectContaining({ id: "background" }),
      galleryImages: [expect.objectContaining({ id: "gallery" })]
    });
    expect(prisma.profileMedia.deleteMany).toHaveBeenCalledWith({ where: { techProfileId: "tech", role: "PROFILE" } });
    expect(prisma.profileMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "PROFILE", sortOrder: 0 })
    });
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.deleteMany.mock.invocationCallOrder[0]
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.create.mock.invocationCallOrder[0]
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });

  it("rejects a thirteenth gallery upload through the legacy upload entry point", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.count.mockResolvedValue(12);

    await expect(createPortfolioUploadRecord("user", validUpload)).rejects.toMatchObject({
      status: 409,
      code: "gallery_full"
    });
    expect(prisma.profileMedia.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });

  it("locks the tech profile before reading cardinality and appends after the maximum gallery position", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.count.mockResolvedValue(2);
    prisma.profileMedia.findFirst.mockResolvedValue({ sortOrder: 4 });
    prisma.profileMedia.create.mockResolvedValue(media({ id: "new", role: "GALLERY", sortOrder: 5 }));

    await saveProfileMedia("user", { ...validUpload, role: "gallery" });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "tech"
    );
    expect(prisma.profileMedia.findFirst).toHaveBeenCalledWith({
      where: { techProfileId: "tech", role: "GALLERY" },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });
    expect(prisma.profileMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "GALLERY", sortOrder: 5 })
    });
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.count.mock.invocationCallOrder[0]
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.findFirst.mock.invocationCallOrder[0]
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.create.mock.invocationCallOrder[0]
    );
  });

  it("deletes only media owned by the authenticated tech", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteProfileMedia("user", "gallery")).resolves.toEqual({
      profileImage: expect.objectContaining({ id: "profile" }),
      backgroundImage: expect.objectContaining({ id: "background" }),
      galleryImages: [expect.objectContaining({ id: "gallery" })]
    });
    expect(prisma.profileMedia.deleteMany).toHaveBeenCalledWith({
      where: { id: "gallery", techProfileId: "tech" }
    });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "tech"
    );
    expect(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.profileMedia.deleteMany.mock.invocationCallOrder[0]
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });

  it("compacts gallery positions after an owned gallery image is deleted", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.deleteMany.mockResolvedValue({ count: 1 });
    prisma.profileMedia.findMany
      .mockResolvedValueOnce([
        media({ id: "gallery-2", role: "GALLERY", sortOrder: 2 }),
        media({ id: "gallery-4", role: "GALLERY", sortOrder: 4 })
      ])
      .mockResolvedValueOnce([
        media({ id: "gallery-2", role: "GALLERY", sortOrder: 0 }),
        media({ id: "gallery-4", role: "GALLERY", sortOrder: 1 })
      ]);

    await deleteProfileMedia("user", "gallery-1");

    expect(prisma.profileMedia.update).toHaveBeenNthCalledWith(1, {
      where: { id: "gallery-2" },
      data: { sortOrder: 0 }
    });
    expect(prisma.profileMedia.update).toHaveBeenNthCalledWith(2, {
      where: { id: "gallery-4" },
      data: { sortOrder: 1 }
    });
  });

  it("cannot delete profile media owned by another tech", async () => {
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech" });
    prisma.profileMedia.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteProfileMedia("user", "another-tech-media")).rejects.toMatchObject({
      status: 404,
      code: "not_found"
    });
    expect(prisma.profileMedia.deleteMany).toHaveBeenCalledWith({
      where: { id: "another-tech-media", techProfileId: "tech" }
    });
    expect(prisma.profileMedia.update).not.toHaveBeenCalled();
  });
});

function media(overrides: Partial<ProfileMedia> & Pick<ProfileMedia, "id" | "role">): ProfileMedia {
  return {
    techProfileId: "tech",
    storagePath: `local/tech/${overrides.id}.png`,
    imageDataUrl: null,
    altText: null,
    sortOrder: 0,
    createdAt: new Date(),
    ...overrides
  };
}
