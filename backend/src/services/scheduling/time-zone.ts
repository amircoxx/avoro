/** Converts explicit business-local timestamps without guessing across DST. */
import { DateTime } from "luxon";

export function strictLocalToUtc(localDate: string, minute: number, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isInteger(minute) || minute < 0 || minute >= 24 * 60) return null;

  const date = DateTime.fromFormat(localDate, "yyyy-MM-dd", { zone: "utc" });
  if (!date.isValid || date.toFormat("yyyy-MM-dd") !== localDate) return null;

  const local = DateTime.fromObject({
    year: date.year,
    month: date.month,
    day: date.day,
    hour: Math.floor(minute / 60),
    minute: minute % 60
  }, { zone: timeZone });

  if (!local.isValid || local.year !== date.year || local.month !== date.month || local.day !== date.day ||
    local.hour !== Math.floor(minute / 60) || local.minute !== minute % 60 || local.getPossibleOffsets().length !== 1) {
    return null;
  }

  return local.toUTC().toJSDate();
}
