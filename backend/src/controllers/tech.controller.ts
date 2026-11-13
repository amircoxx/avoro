/** HTTP adapters for tech profiles, public discovery, and featured tech results. */
import type { NextFunction, Request, Response } from "express";
import { getFeaturedTechs, searchTechsByCity } from "../services/tech-search.service";
import { getPublicAvailability } from "../services/availability.service";
import { getPublicTechProfile, getTechProfileForUser, upsertTechProfile } from "../services/tech-profile.service";
import { getCurrentUser, requireRole } from "../services/session.service";
import { searchQuerySchema } from "../validations/search.schema";
import { techProfileInputSchema } from "../validations/tech-profile.schema";
import { availabilityQuerySchema } from "../validations/booking.schema";

export async function getOwnProfile(request: Request, response: Response, next: NextFunction) {
  try { const user = await requireRole(request.headers.cookie, ["TECH"]); response.json({ data: { profile: await getTechProfileForUser(user.id) } }); } catch (error) { next(error); }
}
export async function saveProfile(request: Request, response: Response, next: NextFunction) {
  try { const user = await requireRole(request.headers.cookie, ["TECH"]); response.status(201).json({ data: await upsertTechProfile(user.id, techProfileInputSchema.parse(request.body)) }); } catch (error) { next(error); }
}
export async function search(request: Request, response: Response, next: NextFunction) {
  try { const query = searchQuerySchema.parse({ city: request.query.city, state: request.query.state || undefined, country: request.query.country || undefined, limit: request.query.limit, offset: request.query.offset }); response.json({ data: await searchTechsByCity(query) }); } catch (error) { next(error); }
}
export async function getPublicProfile(request: Request, response: Response, next: NextFunction) {
  try {
    const techId = readRouteParam(request.params.techId);
    const user = await getCurrentUser(request.headers.cookie);
    response.json({ data: await getPublicTechProfile(techId, user?.role === "CUSTOMER" ? user.id : undefined) });
  } catch (error) { next(error); }
}

export async function getAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const techId = readRouteParam(request.params.techId);
    const query = availabilityQuerySchema.parse(request.query);
    response.json({ data: await getPublicAvailability(techId, query.serviceId, query.month) });
  } catch (error) { next(error); }
}

export async function getFeatured(request: Request, response: Response, next: NextFunction) {
  try {
    const requestedLimit = Number.parseInt(String(request.query.limit ?? "6"), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 6)
      : 6;
    const data = await getFeaturedTechs(limit);
    response.json({ data });
  } catch (error) { next(error); }
}

function readRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
