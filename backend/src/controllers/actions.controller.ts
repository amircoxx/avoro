/** HTTP adapters for reviews, saves, referrals, uploads, and location autocomplete actions. */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { createPortfolioUploadRecord, createReferral as createReferralRecord } from "../services/referrals.service";
import { removeSavedTechForCustomer, saveTechForCustomer } from "../services/saved-tech.service";
import { upsertReview } from "../services/reviews.service";
import { searchLocationSuggestions } from "../services/location-autocomplete.service";
import { requireRole } from "../services/session.service";
import { locationAutocompleteQuerySchema } from "../validations/location-autocomplete.schema";
import { locationCoordsQuerySchema } from "../validations/location-coords.schema";
import { referralInputSchema } from "../validations/referral.schema";
import { reviewInputSchema } from "../validations/review.schema";
import { profileMediaUploadInputSchema, signUploadInputSchema } from "../validations/upload.schema";
import { deleteProfileMedia, saveProfileMedia } from "../services/profile-media.service";
import { AppError } from "../utils/errors";
import { searchCoords } from "../services/location-coords.service";

export async function createReview(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    const techId = Array.isArray(request.params.techId) ? request.params.techId[0] : request.params.techId;
    response.status(201).json({ data: await upsertReview(user.id, techId, reviewInputSchema.parse(request.body)) });
  } catch (error) { next(error); }
}
export async function saveTech(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    response.json({ data: await saveTechForCustomer(user.id, readTechId(request.params.techId)) });
  } catch (error) { next(error); }
}
export async function removeSavedTech(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    response.json({ data: await removeSavedTechForCustomer(user.id, readTechId(request.params.techId)) });
  } catch (error) { next(error); }
}
export async function createReferral(request: Request, response: Response, next: NextFunction) {
  try { const user = await requireRole(request.headers.cookie, ["TECH"]); response.status(201).json({ data: await createReferralRecord(user.id, referralInputSchema.parse(request.body)) }); } catch (error) { next(error); }
}
export async function createUpload(request: Request, response: Response, next: NextFunction) {
  try { const user = await requireRole(request.headers.cookie, ["TECH"]); response.status(201).json({ data: await createPortfolioUploadRecord(user.id, signUploadInputSchema.parse(request.body)) }); } catch (error) { next(error); }
}
export async function saveProfileMediaUpload(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.status(201).json({
      data: await saveProfileMedia(user.id, profileMediaUploadInputSchema.parse(request.body))
    });
  } catch (error) {
    next(error instanceof ZodError
      ? new AppError("Request validation failed", 400, "validation_error")
      : error);
  }
}
export async function removeProfileMedia(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await deleteProfileMedia(user.id, readTechId(request.params.mediaId)) });
  } catch (error) { next(error); }
}
export async function autocompleteLocation(request: Request, response: Response, next: NextFunction) {
  try { const { q } = locationAutocompleteQuerySchema.parse({ q: request.query.q }); response.json({ data: await searchLocationSuggestions(q) }); } catch (error) { next(error); }
}
export async function getLocationFromCoords(request: Request, response: Response, next: NextFunction) {
  try {
    const { lat, lng } = locationCoordsQuerySchema.parse({
      lat: request.query.lat,
      lng: request.query.lng
    });
    response.json({ data: await searchCoords(lat, lng) });
  } catch (error) {
    next(error);
  }
}

function readTechId(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
