import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { TechCalendarBookingDto } from "@/services/api";
import { formatTimeRange } from "./bookings-list";

export function BookingDetail({ booking, scheduleTimeZone, now, detailRef, onRequestCancel, onRequestReschedule }: {
  booking: TechCalendarBookingDto;
  scheduleTimeZone: string;
  now: Date;
  detailRef: RefObject<HTMLElement | null>;
  onRequestReschedule: () => void;
  onRequestCancel: (trigger: HTMLButtonElement) => void;
}) {
  const canCancel = booking.status === "CONFIRMED" && booking.canCancel && now.getTime() < new Date(booking.startAt).getTime();
  const hasTimeZoneChange = booking.timeZone !== scheduleTimeZone;

  return (
    <aside ref={detailRef} className="schedule-booking-detail schedule-panel" aria-label="Booking details" tabIndex={-1}>
      <header className="schedule-booking-detail__heading">
        <div><p className="editorial-kicker">Selected appointment</p><h2>{booking.serviceName}</h2></div>
        <span className={`schedule-status ${booking.status === "CONFIRMED" ? "is-active" : ""}`}>{titleCase(booking.status)}</span>
      </header>
      <dl className="schedule-booking-detail__register">
        <DetailRow label="Booking ID" value={booking.id} mono />
        <DetailRow label="Customer" value={booking.customer.displayName} />
        <DetailRow label="Customer email" value={booking.customer.email} />
        <DetailRow label="Service snapshot" value={booking.serviceName} />
        <DetailRow label="Price snapshot" value={formatPrice(booking.startingPriceCents)} mono />
        <DetailRow label="Duration snapshot" value={`${booking.durationMinutes} minutes`} mono />
        <DetailRow label="Status" value={titleCase(booking.status)} />
        <DetailRow
          label={hasTimeZoneChange ? "Schedule time" : "Appointment time"}
          value={`${formatDate(booking.startAt, scheduleTimeZone)} · ${formatTimeRange(booking.startAt, booking.endAt, scheduleTimeZone)} · ${scheduleTimeZone}`}
        />
        {hasTimeZoneChange ? <DetailRow
          label="Booked time"
          value={`${formatDate(booking.startAt, booking.timeZone)} · ${formatTimeRange(booking.startAt, booking.endAt, booking.timeZone)} · ${booking.timeZone}`}
        /> : null}
      </dl>
      <footer className="schedule-booking-detail__actions">
        {booking.status === "CONFIRMED" && now.getTime() < new Date(booking.startAt).getTime()
          ? <button type="button" className="schedule-primary-action" onClick={onRequestReschedule}>Reschedule appointment</button> : null}
        {canCancel ? <button type="button" className="schedule-primary-action" onClick={(event) => onRequestCancel(event.currentTarget)}>Cancel appointment</button> : (
          <p>{booking.status === "CANCELED" ? "This appointment is canceled. No further action is available." : "Only future confirmed appointments can be canceled."}</p>
        )}
      </footer>
    </aside>
  );
}

export function CancellationDialog({ booking, error, isCanceling, confirmRef, onClose, onConfirm }: {
  booking: TechCalendarBookingDto;
  error: string;
  isCanceling: boolean;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { confirmRef.current?.focus(); }, [confirmRef]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isCanceling) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget.querySelector<HTMLElement>("[role='dialog']");
    const controls = dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) : [];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!controls.includes(document.activeElement as HTMLButtonElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="schedule-cancel-dialog__overlay" onKeyDown={keepFocusInside}>
      <div className="schedule-cancel-dialog__backdrop" aria-hidden="true" onClick={isCanceling ? undefined : onClose} />
      <section className="schedule-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-cancel-title" aria-describedby="schedule-cancel-copy">
        <p className="editorial-kicker">Appointment change</p>
        <h2 id="schedule-cancel-title">Cancel this appointment?</h2>
        <p id="schedule-cancel-copy"><strong>{booking.serviceName}</strong> for {booking.customer.displayName} will be canceled. The customer will be notified.</p>
        {error ? <div ref={errorRef} className="schedule-alert" role="alert" tabIndex={-1}>{error}</div> : null}
        <div className="schedule-cancel-dialog__actions">
          <button type="button" className="schedule-text-action" disabled={isCanceling} onClick={onClose}>Keep appointment</button>
          <button ref={confirmRef} type="button" className="schedule-primary-action" disabled={isCanceling} onClick={onConfirm}>{isCanceling ? "Canceling…" : "Confirm cancellation"}</button>
        </div>
      </section>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "is-mono" : undefined}>{value}</dd></div>;
}

function formatDate(startAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(new Date(startAt));
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function titleCase(value: string) {
  return `${value.slice(0, 1)}${value.slice(1).toLowerCase()}`;
}
