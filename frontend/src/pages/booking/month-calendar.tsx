import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";

export type MonthCalendarProps = {
  month: string;
  availableDates: string[];
  selectedDate: string | null;
  timeZone?: string | null;
  isDisabled?: boolean;
  onSelectDate: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendar({ month, availableDates, selectedDate, timeZone, isDisabled = false, onSelectDate, onPreviousMonth, onNextMonth }: MonthCalendarProps) {
  const days = monthGrid(month);
  const available = new Set(availableDates);
  const monthLabel = formatMonth(month);
  const today = timeZone ? dateInTimeZone(new Date(), timeZone) : null;

  function activateDate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!isDisabled) onSelectDate(date);
  }

  return (
    <section className="booking-month" data-booking-month aria-labelledby="booking-month-heading">
      <div className="booking-month__heading">
        <button type="button" aria-label="Previous month" disabled={isDisabled} onClick={onPreviousMonth}><ChevronLeft aria-hidden="true" /></button>
        <h2 id="booking-month-heading" aria-live="polite">{monthLabel}</h2>
        <button type="button" aria-label="Next month" disabled={isDisabled} onClick={onNextMonth}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className="booking-month__grid" role="grid" aria-label={monthLabel}>
        {weekdays.map((weekday) => <span key={weekday} className="booking-month__weekday" role="columnheader">{weekday}</span>)}
        {days.map((day) => {
          const isAvailable = day.inMonth && available.has(day.date);
          const isSelected = isAvailable && selectedDate === day.date;
          const state = day.inMonth ? isAvailable ? isSelected ? "available, selected" : "available" : "unavailable" : "outside displayed month";
          return (
            <span key={day.date} role="gridcell" aria-selected={isSelected}>
              <button
                type="button"
                data-calendar-date={day.date}
                data-outside-month={day.inMonth ? "false" : "true"}
                disabled={!isAvailable || isDisabled}
                aria-current={day.date === today ? "date" : undefined}
                aria-label={`${day.label}, ${state}`}
                onClick={() => { if (!isDisabled) onSelectDate(day.date); }}
                onKeyDown={(event) => activateDate(event, day.date)}
              >
                <span>{day.dayOfMonth}</span>
                {isAvailable ? <small>{isSelected ? "Selected" : "Open"}</small> : null}
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function monthGrid(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));

  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({
      date,
      dayOfMonth: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === monthIndex,
      label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(cursor)
    });
  }
  return days;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function dateInTimeZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return null;
  }
}
