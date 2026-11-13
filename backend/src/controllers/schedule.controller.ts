/** HTTP adapters for authenticated tech scheduling resources. */
import type { NextFunction, Request, Response } from "express";
import {
  deleteOwnOverride,
  getOwnSchedule,
  listOwnCalendarBookings,
  replaceOwnWeeklyAvailability,
  saveOwnScheduleSettings,
  upsertOwnOverride
} from "../services/schedule.service";
import { createOwnService, listOwnServices, updateOwnService } from "../services/tech-service.service";
import { requireRole } from "../services/session.service";
import {
  overrideWriteSchema,
  bookingCalendarRangeSchema,
  scheduleSettingsSchema,
  serviceIdParamSchema,
  techServiceWriteSchema,
  weeklyAvailabilitySchema
} from "../validations/schedule.schema";

export async function listCalendarBookings(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    const range = bookingCalendarRangeSchema.parse(request.query);
    response.json({ data: await listOwnCalendarBookings(user.id, range) });
  } catch (error) {
    next(error);
  }
}

export async function listServices(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await listOwnServices(user.id) });
  } catch (error) {
    next(error);
  }
}

export async function createService(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.status(201).json({ data: await createOwnService(user.id, techServiceWriteSchema.parse(request.body)) });
  } catch (error) {
    next(error);
  }
}

export async function updateService(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    const serviceId = serviceIdParamSchema.parse(request.params.serviceId);
    response.json({ data: await updateOwnService(user.id, serviceId, techServiceWriteSchema.parse(request.body)) });
  } catch (error) {
    next(error);
  }
}

export async function getScheduleSettings(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await getOwnSchedule(user.id) });
  } catch (error) {
    next(error);
  }
}

export async function saveScheduleSettings(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await saveOwnScheduleSettings(user.id, scheduleSettingsSchema.parse(request.body)) });
  } catch (error) {
    next(error);
  }
}

export async function replaceWeeklyAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await replaceOwnWeeklyAvailability(user.id, weeklyAvailabilitySchema.parse(request.body)) });
  } catch (error) {
    next(error);
  }
}

export async function saveAvailabilityOverride(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({
      data: await upsertOwnOverride(user.id, String(request.params.localDate), overrideWriteSchema.parse(request.body))
    });
  } catch (error) {
    next(error);
  }
}

export async function removeAvailabilityOverride(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    response.json({ data: await deleteOwnOverride(user.id, String(request.params.localDate)) });
  } catch (error) {
    next(error);
  }
}
