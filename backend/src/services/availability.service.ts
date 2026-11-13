/** Loads the minimum public scheduling data and delegates slot arithmetic to the pure engine. */
import { Prisma } from "@prisma/client";
import type { BookingActor } from "./booking.service";
import { DateTime } from "luxon";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import { generateAvailableSlots, type AvailableSlot } from "./scheduling/availability-engine";

export type MonthAvailabilityDto = {
  month: string;
  timeZone: string;
  cancellationCutoffMinutes: number;
  service: { id: string; name: string; durationMinutes: number; startingPriceCents: number };
  slots: AvailableSlot[];
};

export async function getPublicAvailability(
  techId: string,
  serviceId: string,
  month: string,
  now = new Date()
): Promise<MonthAvailabilityDto> {
  const profile = await prisma.techProfile.findFirst({
    where: { id: techId, isPublished: true },
    select: {
      id: true,
      scheduleSettings: {
        select: { timeZone: true, minimumNoticeMinutes: true, maximumAdvanceDays: true, bufferMinutes: true, cancellationCutoffMinutes: true }
      },
      services: {
        where: { id: serviceId, isActive: true },
        select: { id: true, name: true, durationMinutes: true, startingPriceCents: true }
      },
      weeklyAvailability: { select: { weekday: true, startMinute: true, endMinute: true } },
      availabilityOverrides: {
        where: { localDate: { gte: monthDate(month), lt: nextMonthDate(month) } },
        select: { localDate: true, kind: true, windows: { select: { startMinute: true, endMinute: true } } }
      }
    }
  });
  if (!profile) throw new AppError("Tech profile not found", 404, "not_found");

  const service = profile.services[0];
  if (!service) throw new AppError("Tech service not found", 404, "not_found");
  if (service.durationMinutes === null || service.startingPriceCents === null) {
    throw new AppError("Tech service is not bookable", 409, "service_not_bookable");
  }
  const settings = profile.scheduleSettings;
  if (!settings) throw new AppError("Tech availability is not configured", 409, "availability_not_configured");

  const result: MonthAvailabilityDto = {
    month,
    timeZone: settings.timeZone,
    cancellationCutoffMinutes: settings.cancellationCutoffMinutes,
    service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes, startingPriceCents: service.startingPriceCents },
    slots: []
  };
  const minimumStartAt = new Date(now.getTime() + settings.minimumNoticeMinutes * 60_000);
  const maximumStartAt = DateTime.fromJSDate(now).setZone(settings.timeZone).plus({ days: settings.maximumAdvanceDays }).toUTC().toJSDate();
  const monthRange = localMonthRange(month, settings.timeZone);
  if (!monthRange || monthRange.end <= minimumStartAt || monthRange.start > maximumStartAt) return result;

  const bookings = await prisma.booking.findMany({
    where: {
      techProfileId: profile.id,
      status: "CONFIRMED",
      startAt: { lt: new Date(monthRange.end.getTime() + (service.durationMinutes + settings.bufferMinutes) * 60_000) },
      blockedUntilAt: { gt: monthRange.start }
    },
    select: { startAt: true, blockedUntilAt: true }
  });
  result.slots = generateAvailableSlots({
    month,
    timeZone: settings.timeZone,
    durationMinutes: service.durationMinutes,
    bufferMinutes: settings.bufferMinutes,
    minimumStartAt,
    maximumStartAt,
    weekly: profile.weeklyAvailability,
    overrides: profile.availabilityOverrides.map((override) => ({
      localDate: override.localDate.toISOString().slice(0, 10),
      unavailable: override.kind === "UNAVAILABLE",
      windows: override.windows
    })),
    blocked: bookings
  });
  return result;
}

export type RescheduleAvailabilityDto = MonthAvailabilityDto & { bookingId: string; version: number };

/** Uses saved booking details, not the service's current price or duration. */
export async function getRescheduleAvailability(
  actor: BookingActor,
  bookingId: string,
  month: string,
  now = new Date()
): Promise<RescheduleAvailabilityDto> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { techProfile: { select: { userId: true } } }
    });
    if (!booking) throw new AppError("Booking not found", 404, "not_found");
    const isCustomer = actor.role === "CUSTOMER" && booking.customerId === actor.id;
    const isTech = actor.role === "TECH" && booking.techProfile.userId === actor.id;
    if (!isCustomer && !isTech) throw new AppError("You cannot reschedule this booking", 403, "forbidden");
    if (booking.status === "CANCELED") throw new AppError("Canceled bookings cannot be rescheduled", 409, "booking_canceled");
    if (booking.startAt <= now) throw new AppError("Bookings cannot be rescheduled once they start", 409, "booking_already_started");
    if (isCustomer && now.getTime() >= booking.startAt.getTime() - booking.cancellationCutoffMinutesSnapshot * 60_000) {
      throw new AppError("The rescheduling cutoff has passed", 409, "rescheduling_cutoff_passed");
    }
    const settings = await tx.techScheduleSettings.findUnique({ where: { techProfileId: booking.techProfileId } });
    if (!settings) throw new AppError("Tech availability is not configured", 409, "availability_not_configured");
    const range = localMonthRange(month, settings.timeZone);
    if (!range) throw new AppError("Invalid availability month or timezone", 400, "invalid_availability_month");
    const result: RescheduleAvailabilityDto = {
      bookingId, version: booking.version, month, timeZone: settings.timeZone,
      cancellationCutoffMinutes: booking.cancellationCutoffMinutesSnapshot,
      service: {
        id: booking.techServiceId, name: booking.serviceNameSnapshot,
        durationMinutes: booking.durationMinutesSnapshot, startingPriceCents: booking.startingPriceCentsSnapshot
      },
      slots: []
    };
    const minimumStartAt = new Date(now.getTime() + settings.minimumNoticeMinutes * 60_000);
    const maximumStartAt = DateTime.fromJSDate(now).setZone(settings.timeZone).plus({ days: settings.maximumAdvanceDays }).toJSDate();
    if (range.end <= minimumStartAt || range.start > maximumStartAt) return result;
    const weekly = await tx.weeklyAvailabilityWindow.findMany({
      where: { techProfileId: booking.techProfileId },
      select: { weekday: true, startMinute: true, endMinute: true }
    });
    const overrides = await tx.availabilityOverride.findMany({
      where: { techProfileId: booking.techProfileId, localDate: { gte: monthDate(month), lt: nextMonthDate(month) } },
      select: { localDate: true, kind: true, windows: { select: { startMinute: true, endMinute: true } } }
    });
    const blocked = await tx.booking.findMany({
      where: {
        techProfileId: booking.techProfileId, status: "CONFIRMED", id: { not: bookingId },
        startAt: { lt: new Date(range.end.getTime() + (booking.durationMinutesSnapshot + settings.bufferMinutes) * 60_000) },
        blockedUntilAt: { gt: range.start }
      },
      select: { startAt: true, blockedUntilAt: true }
    });
    result.slots = generateAvailableSlots({
      month, timeZone: settings.timeZone, durationMinutes: booking.durationMinutesSnapshot,
      bufferMinutes: settings.bufferMinutes, minimumStartAt, maximumStartAt, weekly,
      overrides: overrides.map((override) => ({
        localDate: override.localDate.toISOString().slice(0, 10),
        unavailable: override.kind === "UNAVAILABLE", windows: override.windows
      })),
      blocked
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function nextMonthDate(month: string) {
  return DateTime.fromFormat(month, "yyyy-MM", { zone: "utc" }).plus({ months: 1 }).toJSDate();
}

function localMonthRange(month: string, timeZone: string) {
  const start = DateTime.fromFormat(month, "yyyy-MM", { zone: timeZone }).startOf("month");
  if (!start.isValid || start.toFormat("yyyy-MM") !== month) return null;
  return { start: start.toUTC().toJSDate(), end: start.plus({ months: 1 }).toUTC().toJSDate() };
}
