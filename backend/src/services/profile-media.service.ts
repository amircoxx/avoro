/** Saves and deletes role-aware profile media for authenticated techs. */
import { randomUUID } from "node:crypto";
import type { Prisma, ProfileMediaRole } from "@prisma/client";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import type { ProfileMediaUploadInput, SignUploadInput } from "../validations/upload.schema";
import { groupProfileMedia } from "./shared/marketplace";

export const MAX_GALLERY_IMAGES = 12;

type StoredProfileMediaInput = SignUploadInput & { role: ProfileMediaUploadInput["role"] };

export async function saveProfileMedia(userId: string, input: StoredProfileMediaInput) {
  const techProfile = await prisma.techProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!techProfile) {
    throw new AppError("Create your tech profile before adding profile media", 409, "missing_tech_profile");
  }
  if (input.fileDataUrl && !input.fileDataUrl.startsWith(`data:${input.contentType};base64,`)) {
    throw new AppError("Uploaded image data does not match the selected file type", 422, "invalid_upload_data");
  }

  const role = toDbProfileMediaRole(input.role);
  const data = {
    techProfileId: techProfile.id,
    role,
    storagePath: createStoragePath(techProfile.id, input.fileName),
    imageDataUrl: input.fileDataUrl ?? null,
    altText: emptyToNull(input.altText)
  };
  const media = role === "GALLERY"
    ? await appendGalleryProfileMedia(techProfile.id, data)
    : await replaceSingletonProfileMedia(techProfile.id, role, { ...data, sortOrder: 0 });

  return groupProfileMedia(media);
}

export async function deleteProfileMedia(userId: string, mediaId: string) {
  const techProfile = await prisma.techProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!techProfile) throw new AppError("Profile media not found", 404, "not_found");

  return groupProfileMedia(await deleteOwnedProfileMedia(techProfile.id, mediaId));
}

async function replaceSingletonProfileMedia(
  techProfileId: string,
  role: Exclude<ProfileMediaRole, "GALLERY">,
  data: Prisma.ProfileMediaUncheckedCreateInput
) {
  return prisma.$transaction(async (tx) => {
    await lockProfileMedia(tx, techProfileId);
    await tx.profileMedia.deleteMany({ where: { techProfileId, role } });
    await tx.profileMedia.create({ data });
    return loadProfileMedia(tx, techProfileId);
  }, { isolationLevel: "ReadCommitted" });
}

async function appendGalleryProfileMedia(
  techProfileId: string,
  data: Omit<Prisma.ProfileMediaUncheckedCreateInput, "sortOrder">
) {
  return prisma.$transaction(async (tx) => {
    await lockProfileMedia(tx, techProfileId);
    const count = await tx.profileMedia.count({ where: { techProfileId, role: "GALLERY" } });
    if (count >= MAX_GALLERY_IMAGES) throw new AppError("Gallery images are limited to 12", 409, "gallery_full");

    const lastGalleryImage = await tx.profileMedia.findFirst({
      where: { techProfileId, role: "GALLERY" },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });
    await tx.profileMedia.create({ data: { ...data, sortOrder: (lastGalleryImage?.sortOrder ?? -1) + 1 } });
    return loadProfileMedia(tx, techProfileId);
  }, { isolationLevel: "ReadCommitted" });
}

async function deleteOwnedProfileMedia(techProfileId: string, mediaId: string) {
  return prisma.$transaction(async (tx) => {
    await lockProfileMedia(tx, techProfileId);
    const result = await tx.profileMedia.deleteMany({ where: { id: mediaId, techProfileId } });
    if (result.count === 0) throw new AppError("Profile media not found", 404, "not_found");

    await reindexGalleryMedia(tx, techProfileId);
    return loadProfileMedia(tx, techProfileId);
  }, { isolationLevel: "ReadCommitted" });
}

async function lockProfileMedia(tx: Prisma.TransactionClient, techProfileId: string) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", techProfileId);
}

function loadProfileMedia(tx: Prisma.TransactionClient, techProfileId: string) {
  return tx.profileMedia.findMany({
    where: { techProfileId },
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
}

async function reindexGalleryMedia(tx: Prisma.TransactionClient, techProfileId: string) {
  const gallery = await tx.profileMedia.findMany({
    where: { techProfileId, role: "GALLERY" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  await Promise.all(gallery.map((item, sortOrder) =>
    tx.profileMedia.update({ where: { id: item.id }, data: { sortOrder } })
  ));
}

function toDbProfileMediaRole(role: ProfileMediaUploadInput["role"]): ProfileMediaRole {
  const roles: Record<ProfileMediaUploadInput["role"], ProfileMediaRole> = {
    profile: "PROFILE",
    background: "BACKGROUND",
    gallery: "GALLERY"
  };
  return roles[role];
}

function createStoragePath(techProfileId: string, fileName: string) {
  const safeFileName = fileName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return `local/${techProfileId}/${randomUUID()}-${safeFileName || "profile-media"}`;
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
