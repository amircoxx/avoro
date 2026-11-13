/** Persists and reads tech profiles for tech and public profile flows. */
import type { Prisma } from "@prisma/client";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import type { TechProfileInput } from "../validations/tech-profile.schema";
import {
  profileInclude,
  toOwnerTechProfile,
  toPublicTechProfile
} from "./shared/marketplace";
import { assertNotSelfReferral } from "./referral.rules";

export async function upsertTechProfile(userId: string, input: TechProfileInput) {
  const profile = await prisma.$transaction(async (tx) => {
    const existingProfile = await tx.techProfile.findUnique({
      where: { userId },
      select: { id: true, referralCode: true }
    });
    const savedProfile = await tx.techProfile.upsert({
      where: { userId },
      update: profileData(input),
      create: { userId, ...profileData(input), referralCode: createReferralCode(input.businessName) }
    });

    if (!existingProfile && input.referredByCode) {
      const referrer = await tx.techProfile.findUnique({ where: { referralCode: input.referredByCode } });
      if (!referrer) throw new AppError("Referral code not found", 404, "referral_code_not_found");
      assertNotSelfReferral(referrer.id, savedProfile.id);
      await tx.referral.create({
        data: {
          referrerTechProfileId: referrer.id,
          referredTechProfileId: savedProfile.id,
          referralCodeUsed: input.referredByCode
        }
      });
      await tx.techProfile.update({
        where: { id: referrer.id },
        data: { referralCount: { increment: 1 } }
      });
    }

    await persistTechProfileDetails(tx, savedProfile.id, input);
    return tx.techProfile.findUniqueOrThrow({ where: { id: savedProfile.id }, include: profileInclude });
  });

  return { ...toPublicTechProfile(profile), referralCode: profile.referralCode };
}

export async function getTechProfileForUser(userId: string) {
  const profile = await prisma.techProfile.findUnique({ where: { userId }, include: profileInclude });
  return profile ? toOwnerTechProfile(profile) : null;
}

export async function getPublicTechProfile(techId: string, customerId?: string) {
  const profile = await prisma.techProfile.findFirst({
    where: { id: techId, isPublished: true },
    include: profileInclude
  });
  if (!profile) throw new AppError("Tech profile not found", 404, "not_found");

  const publicProfile = toPublicTechProfile(profile);
  if (!customerId) return publicProfile;

  const saved = await prisma.savedTech.findFirst({
    where: { customerId, techProfileId: profile.id },
    select: { customerId: true }
  });
  return { ...publicProfile, isSaved: saved !== null };
}

async function persistTechProfileDetails(tx: Prisma.TransactionClient, techProfileId: string, input: TechProfileInput) {
  await tx.techLocation.upsert({
    where: { techProfileId },
    update: locationData(input),
    create: { techProfileId, ...locationData(input) }
  });
}

function profileData(input: TechProfileInput) {
  return {
    businessName: input.businessName,
    displayName: input.displayName,
    bio: emptyToNull(input.bio),
    phone: emptyToNull(input.phone),
    email: emptyToNull(input.email),
    instagramUrl: emptyToNull(input.instagramUrl),
    tiktokUrl: emptyToNull(input.tiktokUrl),
    profileImageUrl: emptyToNull(input.profileImageUrl),
    specialties: input.specialties,
    isPublished: input.isPublished,
    referredByCode: emptyToNull(input.referredByCode)
  };
}

function createReferralCode(businessName: string) {
  const suffix = crypto.randomUUID().slice(0, 6);
  const base = businessName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 2)
    .join("-");

  return `${base || "TECH"}-${suffix.toUpperCase()}`;
}

function locationData(input: TechProfileInput) {
  return {
    privateAddressLine1: emptyToNull(input.location.privateAddressLine1),
    privateAddressLine2: emptyToNull(input.location.privateAddressLine2),
    city: input.location.city,
    state: input.location.state,
    postalCode: emptyToNull(input.location.postalCode),
    country: input.location.country,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    publicLocationLabel: input.location.publicLocationLabel,
    locationVisibility: toDbLocationVisibility(input.location.locationVisibility),
    publicRadiusMiles: input.location.publicRadiusMiles
  };
}

function emptyToNull(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toDbLocationVisibility(value: string) {
  switch (value) {
    case "city_only":
      return "CITY_ONLY" as const;
    case "exact_business_address":
      return "EXACT_BUSINESS_ADDRESS" as const;
    default:
      return "RADIUS_ONLY" as const;
  }
}
