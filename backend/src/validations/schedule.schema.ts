/** Zod contracts for tech-owned scheduling resources. */
import { z } from "zod";

export const techServiceWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  durationMinutes: z.number().int().min(5).max(720),
  startingPriceCents: z.number().int().min(0).max(500000),
  isActive: z.boolean().default(true)
});

export const serviceIdParamSchema = z.string().uuid();

export const availabilityWindowSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
}).refine((value) => value.startMinute < value.endMinute, "End must be after start");

export const scheduleSettingsSchema = z.object({
  timeZone: z.string().trim().min(1).max(100),
  minimumNoticeMinutes: z.number().int().min(0).max(43200),
  maximumAdvanceDays: z.number().int().min(1).max(365),
  bufferMinutes: z.number().int().min(0).max(240),
  cancellationCutoffMinutes: z.number().int().min(0).max(43200)
});

export const weeklyAvailabilitySchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  windows: z.array(availabilityWindowSchema)
}));

export const overrideWriteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("custom"), windows: z.array(availabilityWindowSchema).min(1) })
]);

const offsetDateTimeSchema = z.string().datetime({ offset: true }).refine(isStrictOffsetDateTime, {
  message: "Datetime must be a real offset-aware calendar instant"
});

export const bookingCalendarRangeSchema = z.object({
  from: offsetDateTimeSchema,
  to: offsetDateTimeSchema
}).strict().superRefine((range, context) => {
  const duration = new Date(range.to).getTime() - new Date(range.from).getTime();
  if (duration <= 0) {
    context.addIssue({ code: "custom", path: ["to"], message: "Range end must be after its start" });
  } else if (duration > 93 * 24 * 60 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["to"], message: "Range must be no more than 93 days" });
  }
});

export function isStrictOffsetDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return false;
  if (offset.toUpperCase() !== "Z") {
    const [offsetHour, offsetMinute] = offset.slice(1).split(":").map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(new Date(value).getTime());
}
