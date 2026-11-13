import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ScheduleFacade } from "@/facades/schedule.facade";
import { ApiClientError, type CalendarBookingRange, type TechCalendarBookingDto } from "@/services/api";
import { RescheduleDialog } from "../booking/reschedule-dialog";
import { BookingDetail, CancellationDialog } from "./booking-detail";
import { BookingsList, formatTimeRange } from "./bookings-list";

export type CalendarView = "week" | "month";
export type CalendarRange = CalendarBookingRange & { label: string; localDates: string[] };
export type CalendarBookingPlacement = {
  booking: TechCalendarBookingDto;
  localDate: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  lane: number;
  laneCount: number;
};
const maximumTimeoutDelay = 2_147_483_647;

/** Tech-owned appointment register. All range and placement math is explicit about the schedule timezone. */
export function BookingsCalendar({ scopeKey, timeZone, facade, now = new Date() }: {
  scopeKey: string;
  timeZone: string;
  facade: ScheduleFacade;
  now?: Date;
}) {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => new Date(now));
  const [bookings, setBookings] = useState<TechCalendarBookingDto[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [rescheduling, setRescheduling] = useState<{ scopeKey: string; booking: TechCalendarBookingDto } | null>(null);
  const [success, setSuccess] = useState("");
  const [dialogBookingId, setDialogBookingId] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [clockNow, setClockNow] = useState(() => now.getTime());
  const requestGeneration = useRef(0);
  const cancellationGeneration = useRef(0);
  const cancellationLock = useRef(false);
  const cancellationTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogConfirmRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const focusDetailAfterCancellation = useRef(false);
  const focusDetailAfterReschedule = useRef(false);
  const range = useMemo(() => getCalendarRange(view, anchor, timeZone), [anchor, timeZone, view]);
  const placements = useMemo(() => assignBookingLanes(bookings, timeZone), [bookings, timeZone]);
  const selectedBooking = bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const dialogBooking = bookings.find((booking) => booking.id === dialogBookingId) ?? null;

  useEffect(() => {
    if (!selectedBooking || selectedBooking.status !== "CONFIRMED") return;
    const startAt = new Date(selectedBooking.startAt).getTime();
    const liveNow = Date.now();
    if (liveNow >= startAt) {
      if (clockNow < startAt) setClockNow(liveNow);
      return;
    }
    const timer = setTimeout(() => setClockNow(Date.now()), Math.min(startAt - liveNow, maximumTimeoutDelay));
    return () => clearTimeout(timer);
  }, [clockNow, selectedBooking?.id, selectedBooking?.startAt, selectedBooking?.status]);

  useEffect(() => {
    if (!focusDetailAfterCancellation.current || dialogBooking || selectedBooking?.status !== "CANCELED") return;
    focusDetailAfterCancellation.current = false;
    detailRef.current?.focus();
  }, [dialogBooking, selectedBooking?.status]);

  useEffect(() => {
    if (!focusDetailAfterReschedule.current || !selectedBooking || isLoading) return;
    focusDetailAfterReschedule.current = false;
    detailRef.current?.focus();
  }, [selectedBooking, isLoading]);

  useEffect(() => {
    focusDetailAfterReschedule.current = false;
    requestGeneration.current += 1;
    cancellationGeneration.current += 1;
    cancellationLock.current = false;
    setBookings([]);
    setSelectedBookingId(null);
    setSelectedDate(null);
    setDialogBookingId(null);
    setRescheduling(null);
    setSuccess("");
    setCancellationError("");
    setIsCanceling(false);
    setLoadError("");
  }, [facade, scopeKey, timeZone]);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    setLoadError("");
    void facade.loadBookings({ from: range.from, to: range.to })
      .then((response) => {
        if (requestGeneration.current !== generation) return;
        setBookings((current) => preserveKnownCancellations(current, response));
      })
      .catch((error) => {
        if (requestGeneration.current === generation) setLoadError(errorMessage(error, "Bookings could not be loaded."));
      })
      .finally(() => {
        if (requestGeneration.current === generation) setIsLoading(false);
      });
    return () => { if (requestGeneration.current === generation) requestGeneration.current += 1; };
  }, [facade, range.from, range.to, reloadVersion, scopeKey]);

  useEffect(() => () => {
    requestGeneration.current += 1;
    cancellationGeneration.current += 1;
  }, []);

  function selectBooking(bookingId: string) {
    const placement = placements.find((candidate) => candidate.booking.id === bookingId);
    setSelectedBookingId(bookingId);
    setSelectedDate(placement?.localDate ?? null);
  }

  function moveRange(direction: -1 | 1) {
    invalidateVisibleRange();
    setAnchor(shiftAnchor(anchor, timeZone, view, direction));
  }

  function showToday() {
    const nextAnchor = new Date(now);
    const nextRange = getCalendarRange(view, nextAnchor, timeZone);
    if (nextRange.from === range.from && nextRange.to === range.to) {
      requestGeneration.current += 1;
      setLoadError("");
      setReloadVersion((version) => version + 1);
      setAnchor(nextAnchor);
      return;
    }
    invalidateVisibleRange();
    setAnchor(nextAnchor);
  }

  function changeView(nextView: CalendarView) {
    if (view === nextView) return;
    invalidateVisibleRange();
    setView(nextView);
  }

  function invalidateVisibleRange() {
    requestGeneration.current += 1;
    setBookings([]);
    setSelectedBookingId(null);
    setSelectedDate(null);
    setLoadError("");
  }

  function selectMonthDate(localDate: string) {
    setSelectedDate(localDate);
    const firstBooking = placements.find((placement) => placement.localDate === localDate)?.booking;
    setSelectedBookingId(firstBooking?.id ?? null);
  }

  function openCancellation(trigger: HTMLButtonElement) {
    if (!selectedBooking || selectedBooking.status !== "CONFIRMED" || !selectedBooking.canCancel || isCanceling) return;
    const liveNow = Date.now();
    if (liveNow >= new Date(selectedBooking.startAt).getTime()) {
      setClockNow(liveNow);
      return;
    }
    cancellationTrigger.current = trigger;
    setCancellationError("");
    setDialogBookingId(selectedBooking.id);
  }

  function closeCancellation() {
    if (isCanceling) return;
    cancellationGeneration.current += 1;
    cancellationLock.current = false;
    setDialogBookingId(null);
    setCancellationError("");
    cancellationTrigger.current?.focus();
  }

  async function confirmCancellation() {
    if (!dialogBooking || isCanceling || cancellationLock.current) return;
    cancellationLock.current = true;
    const generation = ++cancellationGeneration.current;
    const bookingId = dialogBooking.id;
    setIsCanceling(true);
    setCancellationError("");
    try {
      const canceled = await facade.cancelBooking(bookingId);
      if (cancellationGeneration.current !== generation) return;
      setBookings((current) => current.map((booking) => booking.id === bookingId ? {
        ...booking,
        status: canceled.status,
        canceledAt: canceled.canceledAt,
        updatedAt: canceled.updatedAt,
        canCancel: false
      } : booking));
      focusDetailAfterCancellation.current = true;
      setDialogBookingId(null);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      if (cancellationGeneration.current === generation) setCancellationError(cancellationMessage(error));
    } finally {
      if (cancellationGeneration.current === generation) {
        cancellationLock.current = false;
        setIsCanceling(false);
      }
    }
  }

  const navigationUnit = view === "week" ? "week" : "month";
  return (
    <section className="schedule-booking-workbench" aria-labelledby="schedule-booking-register-title">
      <header className="schedule-calendar-toolbar schedule-panel">
        <div>
          <p className="editorial-kicker">Booking register</p>
          <h2 id="schedule-booking-register-title">{range.label}</h2>
          <p>{timeZone}</p>
        </div>
        <div className="schedule-calendar-toolbar__controls">
          <div className="schedule-calendar-view-toggle" aria-label="Calendar view">
            <button type="button" aria-pressed={view === "week"} onClick={() => changeView("week")}>Week</button>
            <button type="button" aria-pressed={view === "month"} onClick={() => changeView("month")}>Month</button>
          </div>
          <div className="schedule-calendar-navigation">
            <button type="button" aria-label={`Previous ${navigationUnit}`} onClick={() => moveRange(-1)}>←</button>
            <button type="button" onClick={showToday}>Today</button>
            <button type="button" aria-label={`Next ${navigationUnit}`} onClick={() => moveRange(1)}>→</button>
          </div>
        </div>
      </header>

      {success ? <p role="status" className="reschedule-success">{success}</p> : null}
      {loadError ? <div className="schedule-alert schedule-calendar-alert" role="alert">{loadError}<button type="button" onClick={() => setReloadVersion((version) => version + 1)}>Try again</button></div> : null}
      <p className="schedule-calendar-status" aria-live="polite">{isLoading ? "Loading appointments…" : `${bookings.length} appointment${bookings.length === 1 ? "" : "s"} in view`}</p>

      <div className="schedule-booking-workbench__body" aria-busy={isLoading}>
        <div className="schedule-calendar-surface schedule-panel">
          {view === "week" ? <WeekTimeGrid placements={placements} localDates={range.localDates} timeZone={timeZone} onSelect={selectBooking} /> : (
            <MonthOverview placements={placements} localDates={range.localDates} selectedDate={selectedDate} onSelectDate={selectMonthDate} />
          )}
          <BookingsList placements={placements} timeZone={timeZone} selectedBookingId={selectedBookingId} onSelect={selectBooking} />
        </div>
        {selectedBooking ? <BookingDetail booking={selectedBooking} scheduleTimeZone={timeZone} now={new Date(clockNow)} detailRef={detailRef} onRequestCancel={openCancellation} onRequestReschedule={() => { setSuccess(""); setRescheduling({ scopeKey, booking: selectedBooking }); }} /> : (
          <aside className="schedule-booking-detail schedule-booking-detail--empty schedule-panel" aria-label="Booking details"><p className="editorial-kicker">Appointment detail</p><h2>Select a booking</h2><p>Choose an appointment to review the customer, saved service details, and cancellation action.</p></aside>
        )}
      </div>

      {rescheduling?.scopeKey === scopeKey ? <RescheduleDialog key={`${scopeKey}:${rescheduling.booking.id}`}
        booking={bookings.find(booking => booking.id === rescheduling.booking.id) ?? rescheduling.booking}
        onClose={() => setRescheduling(null)} onConflict={() => setReloadVersion(value => value + 1)}
        onSaved={updated => {
          focusDetailAfterReschedule.current = true;
          requestGeneration.current += 1;
          setRescheduling(null);
          setSuccess("Appointment updated.");
          setBookings([]);
          setSelectedBookingId(updated.id);
          setAnchor(new Date(updated.startAt));
          setSelectedDate(formatLocalDate(localDateParts(new Date(updated.startAt), timeZone)));
          setReloadVersion(value => value + 1);
        }} /> : null}
      {dialogBooking ? <CancellationDialog
        booking={dialogBooking}
        error={cancellationError}
        isCanceling={isCanceling}
        confirmRef={dialogConfirmRef}
        onClose={closeCancellation}
        onConfirm={() => void confirmCancellation()}
      /> : null}
    </section>
  );
}

function WeekTimeGrid({ placements, localDates, timeZone, onSelect }: {
  placements: CalendarBookingPlacement[];
  localDates: string[];
  timeZone: string;
  onSelect: (bookingId: string) => void;
}) {
  const startMinute = Math.min(7 * 60, ...placements.map((placement) => Math.floor(placement.startMinute / 60) * 60));
  const endMinute = Math.max(21 * 60, ...placements.map((placement) => Math.ceil(placement.endMinute / 60) * 60));
  const minutes = endMinute - startMinute;
  const hours = Array.from({ length: Math.ceil(minutes / 60) + 1 }, (_, index) => startMinute + index * 60);
  const gridStyle = { "--calendar-minutes": String(minutes) } as CSSProperties;

  return (
    <div className="schedule-week-time-grid" aria-hidden="true" style={gridStyle}>
      <div className="schedule-week-time-grid__corner">Time</div>
      {localDates.map((localDate) => <div key={localDate} className="schedule-week-time-grid__day-heading"><span>{formatWeekday(localDate)}</span><strong>{Number(localDate.slice(-2))}</strong></div>)}
      <div className="schedule-week-time-grid__hours">{hours.map((minute) => <span key={minute} style={{ top: `${((minute - startMinute) / minutes) * 100}%` }}>{formatMinute(minute)}</span>)}</div>
      {localDates.map((localDate) => <div key={localDate} className="schedule-week-time-grid__day" data-local-date={localDate}>
        {placements.filter((placement) => placement.localDate === localDate).map((placement) => {
          const style = {
            "--booking-offset": String(placement.startMinute - startMinute),
            "--booking-duration": String(placement.durationMinutes),
            "--booking-lane": String(placement.lane),
            "--booking-lane-count": String(placement.laneCount)
          } as CSSProperties;
          return <button
            key={placement.booking.id}
            type="button"
            tabIndex={-1}
            className={`schedule-calendar-event${placement.booking.status === "CANCELED" ? " is-canceled" : ""}`}
            data-booking-id={placement.booking.id}
            data-local-date={placement.localDate}
            data-lane={placement.lane}
            data-lane-count={placement.laneCount}
            style={style}
            onClick={() => onSelect(placement.booking.id)}
          >
            <strong>{placement.booking.serviceName}</strong>
            <span>{formatTimeRange(placement.booking.startAt, placement.booking.endAt, timeZone)}</span>
            {placement.booking.status === "CANCELED" ? <small>Canceled</small> : null}
          </button>;
        })}
      </div>)}
    </div>
  );
}

function MonthOverview({ placements, localDates, selectedDate, onSelectDate }: {
  placements: CalendarBookingPlacement[];
  localDates: string[];
  selectedDate: string | null;
  onSelectDate: (localDate: string) => void;
}) {
  const leadingDays = new Date(`${localDates[0]}T00:00:00.000Z`).getUTCDay();
  return (
    <div className="schedule-month-overview" role="grid" aria-label="Monthly booking overview">
      {weekdays.map((weekday) => <div key={weekday} role="columnheader">{weekday}</div>)}
      {Array.from({ length: leadingDays }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {localDates.map((localDate) => {
        const dayBookings = placements.filter((placement) => placement.localDate === localDate);
        const canceledCount = dayBookings.filter((placement) => placement.booking.status === "CANCELED").length;
        const count = dayBookings.length;
        const label = `${formatLongDate(localDate)}, ${count} booking${count === 1 ? "" : "s"}${canceledCount ? `, ${canceledCount} canceled` : ""}`;
        return <button
          key={localDate}
          type="button"
          role="gridcell"
          data-local-date={localDate}
          aria-label={label}
          aria-pressed={selectedDate === localDate}
          onClick={() => onSelectDate(localDate)}
        ><strong>{Number(localDate.slice(-2))}</strong><span>{count ? `${count} booked` : "Open ledger"}</span>{canceledCount ? <small>{canceledCount} canceled</small> : null}</button>;
      })}
    </div>
  );
}

export function getCalendarRange(view: CalendarView, anchor: Date, timeZone: string): CalendarRange {
  const localAnchor = localDateParts(anchor, timeZone);
  if (view === "month") {
    const first = { year: localAnchor.year, month: localAnchor.month, day: 1 };
    const next = addLocalMonths(first, 1);
    const localDates = localDatesBetween(first, next);
    return {
      from: offsetAwareBoundary(first, timeZone),
      to: offsetAwareBoundary(next, timeZone),
      label: `${monthNames[first.month - 1]} ${first.year}`,
      localDates
    };
  }
  const anchorUtc = new Date(Date.UTC(localAnchor.year, localAnchor.month - 1, localAnchor.day));
  const first = addLocalDays(localAnchor, -anchorUtc.getUTCDay());
  const next = addLocalDays(first, 7);
  return {
    from: offsetAwareBoundary(first, timeZone),
    to: offsetAwareBoundary(next, timeZone),
    label: formatWeekLabel(first, addLocalDays(next, -1)),
    localDates: localDatesBetween(first, next)
  };
}

export function assignBookingLanes(bookings: TechCalendarBookingDto[], timeZone: string): CalendarBookingPlacement[] {
  const placements = bookings.map((booking) => {
    const start = localDateTimeParts(new Date(booking.startAt), timeZone);
    const durationMinutes = Math.max(1, Math.round((new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60_000));
    return {
      booking,
      localDate: formatLocalDate(start),
      startMinute: start.hour * 60 + start.minute,
      endMinute: start.hour * 60 + start.minute + durationMinutes,
      durationMinutes,
      lane: 0,
      laneCount: 1
    };
  }).sort((left, right) => left.localDate.localeCompare(right.localDate) || left.startMinute - right.startMinute || left.endMinute - right.endMinute || left.booking.id.localeCompare(right.booking.id));

  for (const localDate of new Set(placements.map((placement) => placement.localDate))) {
    const day = placements.filter((placement) => placement.localDate === localDate);
    let groupStart = 0;
    while (groupStart < day.length) {
      let groupEnd = groupStart + 1;
      let latestEnd = day[groupStart].endMinute;
      while (groupEnd < day.length && day[groupEnd].startMinute < latestEnd) {
        latestEnd = Math.max(latestEnd, day[groupEnd].endMinute);
        groupEnd += 1;
      }
      const laneEnds: number[] = [];
      for (const placement of day.slice(groupStart, groupEnd)) {
        let lane = laneEnds.findIndex((endMinute) => endMinute <= placement.startMinute);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = placement.endMinute;
        placement.lane = lane;
      }
      for (const placement of day.slice(groupStart, groupEnd)) placement.laneCount = laneEnds.length;
      groupStart = groupEnd;
    }
  }
  return placements;
}

type LocalDate = { year: number; month: number; day: number };
type LocalDateTime = LocalDate & { hour: number; minute: number; second: number };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function localDateParts(instant: Date, timeZone: string): LocalDate {
  const parts = localDateTimeParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function localDateTimeParts(instant: Date, timeZone: string): LocalDateTime {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function addLocalDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function addLocalMonths(date: LocalDate, months: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 };
}

function localDatesBetween(first: LocalDate, exclusiveEnd: LocalDate) {
  const dates: string[] = [];
  for (let date = first; formatLocalDate(date) !== formatLocalDate(exclusiveEnd); date = addLocalDays(date, 1)) dates.push(formatLocalDate(date));
  return dates;
}

function offsetAwareBoundary(localDate: LocalDate, timeZone: string) {
  const localUtc = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
  let instant = localUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = localUtc - timeZoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
    if (next === instant) break;
    instant = next;
  }
  const offset = timeZoneOffsetMinutes(new Date(instant), timeZone);
  return `${formatLocalDate(localDate)}T00:00:00.000${formatOffset(offset)}`;
}

function timeZoneOffsetMinutes(instant: Date, timeZone: string) {
  const local = localDateTimeParts(instant, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((localAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

function formatOffset(offsetMinutes: number) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function shiftAnchor(anchor: Date, timeZone: string, view: CalendarView, direction: -1 | 1) {
  const current = localDateParts(anchor, timeZone);
  const next = view === "week" ? addLocalDays(current, direction * 7) : addLocalMonths(current, direction);
  return localNoonInstant(next, timeZone);
}

function localNoonInstant(localDate: LocalDate, timeZone: string) {
  const localUtc = Date.UTC(localDate.year, localDate.month - 1, localDate.day, 12);
  let instant = localUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) instant = localUtc - timeZoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

function formatLocalDate(date: LocalDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function formatWeekLabel(first: LocalDate, last: LocalDate) {
  if (first.year === last.year && first.month === last.month) return `${monthNames[first.month - 1]} ${first.day}–${last.day}, ${first.year}`;
  if (first.year === last.year) return `${monthNames[first.month - 1]} ${first.day}–${monthNames[last.month - 1]} ${last.day}, ${first.year}`;
  return `${monthNames[first.month - 1]} ${first.day}, ${first.year}–${monthNames[last.month - 1]} ${last.day}, ${last.year}`;
}

function formatWeekday(localDate: string) {
  return weekdays[new Date(`${localDate}T00:00:00.000Z`).getUTCDay()];
}

function formatLongDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatMinute(minute: number) {
  const normalized = minute % 1440;
  const hour = Math.floor(normalized / 60);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:00 ${suffix}`;
}

function preserveKnownCancellations(current: TechCalendarBookingDto[], response: TechCalendarBookingDto[]) {
  const canceled = new Map(current.filter((booking) => booking.status === "CANCELED").map((booking) => [booking.id, booking]));
  return response.map((booking) => booking.status === "CONFIRMED" && canceled.has(booking.id) ? canceled.get(booking.id)! : booking);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function cancellationMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === "booking_already_started") return "This appointment has already started and cannot be canceled.";
    if (error.code === "forbidden" || error.code === "not_found") return "This appointment is no longer available to cancel.";
    if (error.code === "booking_conflict") return "The appointment could not be canceled. Refresh and try again.";
  }
  return "This appointment could not be canceled. Try again.";
}
