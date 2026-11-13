/** Implements customer save, remove, and list behavior for published tech profiles. */
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import { profileInclude, toPublicTechProfile } from "./shared/marketplace";

export async function saveTechForCustomer(customerId: string, techProfileId: string) {
  await findPublishedTechProfile(techProfileId);
  await prisma.savedTech.upsert({
    where: {
      customerId_techProfileId: {
        customerId,
        techProfileId
      }
    },
    update: {},
    create: {
      customerId,
      techProfileId
    }
  });

  return { saved: true as const };
}

export async function removeSavedTechForCustomer(customerId: string, techProfileId: string) {
  await prisma.savedTech.deleteMany({
    where: {
      customerId,
      techProfileId
    }
  });

  return { saved: false as const };
}

export async function listSavedTechsForCustomer(customerId: string) {
  const saves = await prisma.savedTech.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      techProfile: {
        include: profileInclude
      }
    }
  });

  return saves
    .map((save) => save.techProfile)
    .filter((profile) => profile.isPublished)
    .map(toPublicTechProfile);
}

async function findPublishedTechProfile(techProfileId: string) {
  const profile = await prisma.techProfile.findFirst({
    where: {
      id: techProfileId,
      isPublished: true
    },
    select: { id: true }
  });

  if (!profile) {
    throw new AppError("Tech profile not found", 404, "not_found");
  }

  return profile;
}
