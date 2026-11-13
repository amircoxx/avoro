/** Owns durable CRUD operations for a tech's bookable services. */
import type { TechService } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import { techServiceWriteSchema } from "../validations/schedule.schema";

type TechServiceWriteInput = z.infer<typeof techServiceWriteSchema>;

export interface TechServiceDto {
  id: string;
  name: string;
  description: string;
  durationMinutes: number | null;
  startingPriceCents: number | null;
  isActive: boolean;
}

export async function listOwnServices(userId: string): Promise<TechServiceDto[]> {
  const techProfileId = await getTechProfileId(userId);
  const services = await prisma.techService.findMany({
    where: { techProfileId },
    orderBy: { createdAt: "asc" }
  });

  return services.map(toTechServiceDto);
}

export async function createOwnService(userId: string, input: TechServiceWriteInput): Promise<TechServiceDto> {
  const techProfileId = await getTechProfileId(userId);
  const service = await prisma.techService.create({
    data: { techProfileId, ...input }
  });

  return toTechServiceDto(service);
}

export async function updateOwnService(
  userId: string,
  serviceId: string,
  input: TechServiceWriteInput
): Promise<TechServiceDto> {
  const techProfileId = await getTechProfileId(userId);
  const result = await prisma.techService.updateMany({
    where: { id: serviceId, techProfileId },
    data: input
  });
  if (result.count === 0) throw new AppError("Tech service not found", 404, "not_found");

  const service = await prisma.techService.findFirst({
    where: { id: serviceId, techProfileId }
  });
  if (!service) throw new AppError("Tech service not found", 404, "not_found");
  return toTechServiceDto(service);
}

async function getTechProfileId(userId: string) {
  const techProfile = await prisma.techProfile.findUnique({
    where: { userId },
    select: { id: true }
  });
  if (!techProfile) {
    throw new AppError("Create your tech profile before managing services", 409, "missing_tech_profile");
  }
  return techProfile.id;
}

function toTechServiceDto(service: TechService): TechServiceDto {
  return {
    id: service.id,
    name: service.name,
    description: service.description ?? "",
    durationMinutes: service.durationMinutes,
    startingPriceCents: service.startingPriceCents,
    isActive: service.isActive
  };
}
