/** Generates public booking starts from explicit schedule data without database dependencies. */
import { DateTime } from "luxon";
import { strictLocalToUtc } from "./time-zone";

export type AvailableSlot = {
  startAt: string;
  localDate: string;
  localTime: string;
  timeZone: string;
};

export type AvailabilityEngineInput = {
  month: string;
  timeZone: string;
  durationMinutes: number;
  bufferMinutes: number;
  minimumStartAt: Date;
  maximumStartAt: Date;
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  overrides: Array<{ localDate: string; unavailable: boolean; windows: Array<{ startMinute: number; endMinute: number }> }>;
  blocked: Array<{ startAt: Date; blockedUntilAt: Date }>;
};

export function generateAvailableSlots(input: AvailabilityEngineInput): AvailableSlot[] {
  const monthStart = DateTime.fromFormat(input.month, "yyyy-MM", { zone: input.timeZone });
  if (!monthStart.isValid || monthStart.toFormat("yyyy-MM") !== input.month || !isValidInput(input)) return [];

  const slots: AvailableSlot[] = [];
  const totalBlockedMinutes = input.durationMinutes + input.bufferMinutes;
  for (let day = monthStart.startOf("month"); day < monthStart.endOf("month"); day = day.plus({ days: 1 })) {
    const localDate = day.toISODate();
    if (!localDate) continue;
    const override = input.overrides.find((item) => item.localDate === localDate);
    const windows = override ? (override.unavailable ? [] : override.windows) : input.weekly.filter((item) => item.weekday === day.weekday % 7);

    for (const window of windows) {
      for (let minute = alignToHalfHour(window.startMinute); minute + totalBlockedMinutes <= window.endMinute; minute += 30) {
        const candidateStart = strictLocalToUtc(localDate, minute, input.timeZone);
        if (!candidateStart) continue;
        const candidateBlockedUntil = new Date(candidateStart.getTime() + totalBlockedMinutes * 60_000);
        if (!blockedEndFitsWindow(candidateBlockedUntil, localDate, window.endMinute, input.timeZone)) continue;
        if (candidateStart < input.minimumStartAt || candidateStart > input.maximumStartAt ||
          input.blocked.some((existing) => candidateStart < existing.blockedUntilAt && candidateBlockedUntil > existing.startAt)) continue;

        slots.push({
          startAt: candidateStart.toISOString(),
          localDate,
          localTime: DateTime.fromJSDate(candidateStart).setZone(input.timeZone).toFormat("h:mm a"),
          timeZone: input.timeZone
        });
      }
    }
  }
  return slots.sort((left, right) => left.startAt.localeCompare(right.startAt));
}

function alignToHalfHour(minute: number) {
  return Math.ceil(minute / 30) * 30;
}

function blockedEndFitsWindow(blockedUntil: Date, localDate: string, windowEndMinute: number, timeZone: string) {
  const end = DateTime.fromJSDate(blockedUntil).setZone(timeZone);
  if (!end.isValid || end.second !== 0 || end.millisecond !== 0) return false;
  const endMinute = end.hour * 60 + end.minute;
  if (end.toISODate() === localDate) return endMinute <= windowEndMinute;

  const nextDate = DateTime.fromFormat(localDate, "yyyy-MM-dd", { zone: timeZone }).plus({ days: 1 }).toISODate();
  return windowEndMinute === 1440 && end.toISODate() === nextDate && endMinute === 0;
}

function isValidInput(input: AvailabilityEngineInput) {
  return Number.isInteger(input.durationMinutes) && input.durationMinutes > 0 &&
    Number.isInteger(input.bufferMinutes) && input.bufferMinutes >= 0 &&
    !Number.isNaN(input.minimumStartAt.getTime()) && !Number.isNaN(input.maximumStartAt.getTime()) &&
    input.minimumStartAt <= input.maximumStartAt;
}
