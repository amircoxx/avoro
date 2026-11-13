/** Persists a tech's bookable hours without changing confirmed bookings. */
import {
  Prisma,
  type AvailabilityOverride,
  type AvailabilityOverrideWindow,
  type TechScheduleSettings,
  type WeeklyAvailabilityWindow
} from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import { bookingDisplayInclude, toTechCalendarBookingDto, type TechCalendarBookingDto } from "./shared/booking";
import {
  isStrictOffsetDateTime,
  overrideWriteSchema,
  scheduleSettingsSchema,
  weeklyAvailabilitySchema
} from "../validations/schedule.schema";

export type AvailabilityWindowInput = { startMinute: number; endMinute: number };
export type WeeklyAvailabilityInput = { weekday: number; windows: AvailabilityWindowInput[] };
export type ScheduleSettingsDto = {
  timeZone: string;
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  bufferMinutes: number;
  cancellationCutoffMinutes: number;
};
export type AvailabilityOverrideDto = {
  localDate: string;
  kind: "unavailable" | "custom";
  windows: AvailabilityWindowInput[];
};
export type ScheduleWarning = {
  bookingId: string;
  startAt: string;
  timeZoneSnapshot: string;
  message: "Existing booking falls outside the updated availability";
};
export type ScheduleDto = {
  settings: ScheduleSettingsDto | null;
  weeklyAvailability: Array<AvailabilityWindowInput & { weekday: number }>;
  overrides: AvailabilityOverrideDto[];
};
export type ScheduleWriteResult<T> = T & { warnings: ScheduleWarning[] };
export type ScheduleServiceOptions = { now?: Date };
export type BookingCalendarRange = { from: string; to: string };

type SettingsInput = z.infer<typeof scheduleSettingsSchema>;
type OverrideInput = z.infer<typeof overrideWriteSchema>;
type Window = AvailabilityWindowInput & { weekday: number };
type OverrideRecord = AvailabilityOverride & { windows: AvailabilityOverrideWindow[] };

export async function getOwnSchedule(userId: string): Promise<ScheduleDto> {
  const techProfileId = await getTechProfileId(userId);
  const [settings, weeklyAvailability, overrides] = await Promise.all([
    prisma.techScheduleSettings.findUnique({ where: { techProfileId } }),
    prisma.weeklyAvailabilityWindow.findMany({ where: { techProfileId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.availabilityOverride.findMany({
      where: { techProfileId },
      include: { windows: { orderBy: { startMinute: "asc" } } },
      orderBy: { localDate: "asc" }
    })
  ]);
  return {
    settings: settings ? toSettingsDto(settings) : null,
    weeklyAvailability: weeklyAvailability.map(toWeeklyWindow),
    overrides: overrides.map(toOverrideDto)
  };
}

export async function listOwnCalendarBookings(
  userId: string,
  range: BookingCalendarRange,
  now = new Date()
): Promise<TechCalendarBookingDto[]> {
  const { from, to } = parseBookingCalendarRange(range);
  const profile = await prisma.techProfile.findUnique({
    where: { userId },
    select: { id: true, userId: true, scheduleSettings: { select: { timeZone: true } } }
  });
  if (!profile) throw new AppError("Create your tech profile before viewing bookings", 409, "missing_tech_profile");
  const bookings = await prisma.booking.findMany({
    where: {
      techProfileId: profile.id,
      startAt: { gte: from, lt: to },
      status: { in: ["CONFIRMED", "CANCELED"] }
    },
    include: bookingDisplayInclude,
    orderBy: { startAt: "asc" }
  });
  return bookings.map((booking) => toTechCalendarBookingDto(
    booking,
    booking.status === "CONFIRMED" && now.getTime() < booking.startAt.getTime(),
    profile.scheduleSettings?.timeZone
  ));
}

export async function saveOwnScheduleSettings(
  userId: string,
  input: SettingsInput,
  options: ScheduleServiceOptions = {}
): Promise<ScheduleWriteResult<{ settings: ScheduleSettingsDto }>> {
  assertTimeZone(input.timeZone);
  const techProfileId = await getTechProfileId(userId);
  return prisma.$transaction(async (tx) => {
    const settings = await tx.techScheduleSettings.upsert({
      where: { techProfileId },
      create: { techProfileId, ...input },
      update: input
    });
    const warnings = await findScheduleWarnings(tx, techProfileId, toSettingsDto(settings), options.now ?? new Date());
    return { settings: toSettingsDto(settings), warnings };
  });
}

export async function replaceOwnWeeklyAvailability(
  userId: string,
  input: WeeklyAvailabilityInput,
  options?: ScheduleServiceOptions
): Promise<ScheduleWriteResult<{ weeklyAvailability: Window[] }>>;
export async function replaceOwnWeeklyAvailability(
  userId: string,
  input: WeeklyAvailabilityInput[],
  options?: ScheduleServiceOptions
): Promise<ScheduleWriteResult<{ weeklyAvailability: Window[] }>>;
export async function replaceOwnWeeklyAvailability(
  userId: string,
  input: WeeklyAvailabilityInput | WeeklyAvailabilityInput[],
  options: ScheduleServiceOptions = {}
): Promise<ScheduleWriteResult<{ weeklyAvailability: Window[] }>> {
  const weekly = normalizeWeeklyAvailability(input);
  assertNoOverlaps(weekly);
  const techProfileId = await getTechProfileId(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TechProfile" WHERE "id" = ${techProfileId} FOR UPDATE`);
    await tx.weeklyAvailabilityWindow.deleteMany({ where: { techProfileId } });
    if (weekly.length > 0) await tx.weeklyAvailabilityWindow.createMany({ data: weekly.map((window) => ({ techProfileId, ...window })) });
    const settings = await tx.techScheduleSettings.findUnique({ where: { techProfileId } });
    const warnings = settings ? await findScheduleWarnings(tx, techProfileId, toSettingsDto(settings), options.now ?? new Date()) : [];
    return { weeklyAvailability: weekly, warnings };
  });
}

export async function upsertOwnOverride(
  userId: string,
  localDate: string,
  input: OverrideInput,
  options: ScheduleServiceOptions = {}
): Promise<ScheduleWriteResult<AvailabilityOverrideDto>> {
  const parsedDate = parseLocalDate(localDate);
  const windows = input.kind === "custom" ? input.windows : [];
  assertNoOverlaps(windows.map((window) => ({ ...window, weekday: 0 })));
  const techProfileId = await getTechProfileId(userId);
  return prisma.$transaction(async (tx) => {
    const override = await tx.availabilityOverride.upsert({
      where: { techProfileId_localDate: { techProfileId, localDate: parsedDate } },
      create: {
        techProfileId,
        localDate: parsedDate,
        kind: input.kind === "unavailable" ? "UNAVAILABLE" : "CUSTOM_HOURS",
        windows: windows.length ? { create: windows } : undefined
      },
      update: {
        kind: input.kind === "unavailable" ? "UNAVAILABLE" : "CUSTOM_HOURS",
        windows: { deleteMany: {}, create: windows }
      },
      include: { windows: { orderBy: { startMinute: "asc" } } }
    });
    const settings = await tx.techScheduleSettings.findUnique({ where: { techProfileId } });
    const warnings = settings ? await findScheduleWarnings(tx, techProfileId, toSettingsDto(settings), options.now ?? new Date()) : [];
    return { ...toOverrideDto(override), warnings };
  });
}

export async function deleteOwnOverride(
  userId: string,
  localDate: string,
  options: ScheduleServiceOptions = {}
): Promise<ScheduleWriteResult<{ localDate: string }>> {
  const parsedDate = parseLocalDate(localDate);
  const techProfileId = await getTechProfileId(userId);
  return prisma.$transaction(async (tx) => {
    await tx.availabilityOverride.deleteMany({ where: { techProfileId, localDate: parsedDate } });
    const settings = await tx.techScheduleSettings.findUnique({ where: { techProfileId } });
    const warnings = settings ? await findScheduleWarnings(tx, techProfileId, toSettingsDto(settings), options.now ?? new Date()) : [];
    return { localDate, warnings };
  });
}

function normalizeWeeklyAvailability(input: WeeklyAvailabilityInput | WeeklyAvailabilityInput[]) {
  const days = Array.isArray(input) ? input : [input];
  const parsed = weeklyAvailabilitySchema.parse(days);
  return parsed.flatMap(({ weekday, windows }) => windows.map((window) => ({ weekday, ...window })));
}

function assertNoOverlaps(windows: Window[]) {
  const byWeekday = new Map<number, Window[]>();
  for (const window of windows) byWeekday.set(window.weekday, [...(byWeekday.get(window.weekday) ?? []), window]);
  for (const dayWindows of byWeekday.values()) {
    const sorted = [...dayWindows].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startMinute < sorted[index - 1].endMinute) {
        throw new AppError("Availability windows cannot overlap", 400, "overlapping_availability");
      }
    }
  }
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new AppError("Time zone must be a valid IANA name", 400, "invalid_time_zone");
  }
}

function parseLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError("Date must use YYYY-MM-DD", 400, "invalid_local_date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError("Date must use YYYY-MM-DD", 400, "invalid_local_date");
  }
  return date;
}

function parseBookingCalendarRange(range: BookingCalendarRange) {
  if (!isStrictOffsetDateTime(range.from) || !isStrictOffsetDateTime(range.to)) {
    throw new AppError("Booking calendar range must use offset-aware ISO datetimes", 400, "invalid_booking_range");
  }
  const from = new Date(range.from);
  const to = new Date(range.to);
  const duration = to.getTime() - from.getTime();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || duration <= 0 || duration > 93 * 24 * 60 * 60 * 1000) {
    throw new AppError("Booking calendar range must be no more than 93 days", 400, "invalid_booking_range");
  }
  return { from, to };
}

async function getTechProfileId(userId: string) {
  const profile = await prisma.techProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new AppError("Create your tech profile before managing availability", 409, "missing_tech_profile");
  return profile.id;
}

async function findScheduleWarnings(
  tx: Prisma.TransactionClient,
  techProfileId: string,
  settings: ScheduleSettingsDto,
  now: Date
): Promise<ScheduleWarning[]> {
  const [weekly, overrides, bookings] = await Promise.all([
    tx.weeklyAvailabilityWindow.findMany({ where: { techProfileId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    tx.availabilityOverride.findMany({
      where: { techProfileId },
      include: { windows: { orderBy: { startMinute: "asc" } } },
      orderBy: { localDate: "asc" }
    }),
    tx.booking.findMany({
      where: { techProfileId, status: "CONFIRMED", startAt: { gte: now } },
      select: { id: true, startAt: true, endAt: true, timeZoneSnapshot: true }
    })
  ]);
  return bookings.filter((booking) => !fitsSchedule(booking, settings.timeZone, weekly, overrides)).map((booking) => ({
    bookingId: booking.id,
    startAt: booking.startAt.toISOString(),
    timeZoneSnapshot: booking.timeZoneSnapshot,
    message: "Existing booking falls outside the updated availability"
  }));
}

function fitsSchedule(
  booking: { startAt: Date; endAt: Date },
  timeZone: string,
  weekly: WeeklyAvailabilityWindow[],
  overrides: OverrideRecord[]
) {
  const local = localDateParts(booking.startAt, timeZone);
  const override = overrides.find((item) => item.localDate.toISOString().slice(0, 10) === local.date);
  if (override?.kind === "UNAVAILABLE") return false;
  const windows = override ? override.windows : weekly.filter((window) => window.weekday === local.weekday);
  const endLocal = localDateParts(booking.endAt, timeZone);
  if (endLocal.date !== local.date) return false;
  return windows.some((window) => local.minute >= window.startMinute && endLocal.minute <= window.endMinute);
}

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    weekday: weekdays.indexOf(part("weekday")),
    minute: Number(part("hour")) * 60 + Number(part("minute"))
  };
}

function toSettingsDto(settings: TechScheduleSettings): ScheduleSettingsDto {
  const { timeZone, minimumNoticeMinutes, maximumAdvanceDays, bufferMinutes, cancellationCutoffMinutes } = settings;
  return { timeZone, minimumNoticeMinutes, maximumAdvanceDays, bufferMinutes, cancellationCutoffMinutes };
}

function toWeeklyWindow(window: WeeklyAvailabilityWindow): Window {
  return { weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute };
}

function toOverrideDto(override: OverrideRecord): AvailabilityOverrideDto {
  return {
    localDate: override.localDate.toISOString().slice(0, 10),
    kind: override.kind === "UNAVAILABLE" ? "unavailable" : "custom",
    windows: override.windows.map(({ startMinute, endMinute }) => ({ startMinute, endMinute }))
  };
}
