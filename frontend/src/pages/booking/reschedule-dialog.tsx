/** Shared appointment move flow; HTTP requests remain in the booking API module. */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as bookingApi from "@/services/api/bookings";
import { ApiClientError, type BookingDto, type RescheduleAvailability, type RescheduleBookingInput } from "@/services/api";
import { MonthCalendar } from "./month-calendar";
import { DaySlots } from "./day-slots";

export type ReschedulingApi = Pick<typeof bookingApi, "getRescheduleAvailability" | "rescheduleBooking">;

export function RescheduleDialog({ booking, api = bookingApi, onClose, onSaved, onConflict }: {
  booking: BookingDto;
  api?: ReschedulingApi;
  onClose: () => void;
  onSaved: (booking: BookingDto) => void;
  onConflict?: () => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const intent = useRef<{ fingerprint: string; input: RescheduleBookingInput } | null>(null);
  const [month, setMonth] = useState(() => monthInZone(booking.startAt, booking.timeZone));
  const [availability, setAvailability] = useState<RescheduleAvailability | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    mounted.current = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current;
    element?.showModal();
    return () => {
      mounted.current = false;
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setAvailability(null);
    setStart(null);
    setDate(null);
    void api.getRescheduleAvailability(booking.id, month).then(result => {
      if (!active) return;
      setAvailability(result);
    }).catch(error => {
      if (active) setLoadError(message(error, "Available times could not be loaded. Try again."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, booking.id, month, reload]);

  function changeMonth(direction: number) {
    const [year, number] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(year, number - 1 + direction, 1)).toISOString().slice(0, 7));
    setAvailability(null);
    setStart(null);
    setDate(null);
    setSaveError("");
  }

  async function save() {
    if (!availability || !start || loading || submitting.current) return;
    const trimmedReason = reason.trim();
    const fingerprint = JSON.stringify([booking.id, availability.version, start, trimmedReason]);
    if (intent.current?.fingerprint !== fingerprint) {
      intent.current = { fingerprint, input: {
        startAt: start, version: availability.version, requestKey: crypto.randomUUID(),
        ...(trimmedReason ? { reason: trimmedReason } : {})
      } };
    }
    submitting.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await api.rescheduleBooking(booking.id, intent.current.input);
      if (mounted.current) onSaved(updated);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiClientError && ["booking_conflict", "booking_version_conflict", "request_key_conflict"].includes(error.code ?? "")) {
        intent.current = null;
        setStart(null);
        setAvailability(null);
        setNotice("The appointment or available times changed. Review the refreshed calendar and choose a time again.");
        setReload(value => value + 1);
        onConflict?.();
      } else if (error instanceof ApiClientError && ["booking_canceled", "booking_already_started", "rescheduling_cutoff_passed", "forbidden", "not_found"].includes(error.code ?? "")) {
        setAvailability(null);
        setLoadError(message(error, "This appointment can no longer be rescheduled."));
        onConflict?.();
      } else {
        // Keep the exact request key and payload for an ambiguous network retry.
        setSaveError("We couldn’t confirm the change. Try again with the same selection to check it safely.");
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const slots = availability?.slots.filter(slot => slot.startAt !== booking.startAt) ?? [];
  const zone = availability?.timeZone ?? booking.timeZone;
  return createPortal(
    <dialog ref={dialog} className="reschedule-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (!submitting.current) onClose(); }}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <header className="reschedule-dialog__header">
          <div><p className="editorial-kicker">Appointment change</p><h2 id={titleId}>Reschedule appointment</h2></div>
          <button type="button" className="reschedule-dialog__close" disabled={saving} aria-label="Close rescheduling" onClick={onClose}>×</button>
        </header>
        <div className="reschedule-dialog__appointment">
          <strong>{booking.serviceName}</strong>
          <span>{booking.durationMinutes} minutes · {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(booking.startingPriceCents / 100)}</span>
          <p><span className="editorial-kicker">Current appointment</span><br />{formatStart(booking.startAt, zone)}</p>
          <p>Your existing appointment stays reserved until the change is confirmed.</p>
        </div>
        {notice ? <p className="reschedule-dialog__notice" role="status">{notice}</p> : null}
        {loadError ? <div className="reschedule-dialog__error" role="alert">{loadError} <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload available times</button></div> : null}
        <div className="reschedule-dialog__picker" aria-busy={loading}>
          <MonthCalendar month={month} availableDates={[...new Set(slots.map(slot => slot.localDate))]} selectedDate={date}
            timeZone={zone} isDisabled={saving} onPreviousMonth={() => changeMonth(-1)} onNextMonth={() => changeMonth(1)}
            onSelectDate={value => { setDate(value); setStart(null); setSaveError(""); }} />
          <DaySlots selectedDate={date} slots={slots.filter(slot => slot.localDate === date)} selectedStartAt={start}
            timeZone={zone} isLoading={loading} isDisabled={saving} onSelectSlot={slot => { setStart(slot.startAt); setSaveError(""); }} />
        </div>
        {!loading && availability && slots.length === 0 ? <p className="reschedule-dialog__notice">No alternative times are available this month. Try another month.</p> : null}
        <div className="reschedule-dialog__review">
          <label htmlFor={reasonId}>Reason <span>(optional)</span></label>
          <textarea id={reasonId} value={reason} maxLength={500} rows={2} disabled={saving}
            onChange={event => { setReason(event.target.value); setSaveError(""); }} />
          <p className="reschedule-dialog__new-time" aria-live="polite"><span className="editorial-kicker">New appointment</span><br />{start ? formatStart(start, zone) : "Choose a date and time above."}</p>
          {saveError ? <p className="reschedule-dialog__error" role="alert">{saveError}</p> : null}
          <p>A confirmation email will be sent to the customer and the tech.</p>
        </div>
        <footer className="reschedule-dialog__actions">
          <button type="button" className="editorial-button" disabled={saving} onClick={onClose}>Keep current appointment</button>
          <button type="submit" className="editorial-button editorial-button--primary" disabled={!start || !availability || loading || saving}>
            {saving ? "Rescheduling…" : "Confirm new time"}
          </button>
        </footer>
      </form>
    </dialog>, document.body
  );
}

function monthInZone(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(instant));
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}
function formatStart(instant: string, timeZone: string) {
  return `${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(instant))} · ${timeZone}`;
}
function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
