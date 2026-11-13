import type { BookingDto } from "@/services/api";

export function BookingDetail({ booking, now, onCancel, onReschedule }: { booking: BookingDto; now: number; onCancel: (booking: BookingDto, trigger: HTMLButtonElement) => void; onReschedule: (booking: BookingDto) => void }) {
  const appointmentName = booking.tech.businessName || booking.tech.displayName;
  const startAt = new Date(booking.startAt).getTime();
  const cancellationDeadline = startAt - booking.cancellationCutoffMinutes * 60_000;
  const isPastConfirmed = booking.status === "CONFIRMED" && now >= startAt;
  const isCancelable = booking.status === "CONFIRMED" && !isPastConfirmed && booking.canCancel && now < cancellationDeadline;
  const hasClosedWindow = booking.status === "CONFIRMED" && !isPastConfirmed && !isCancelable;

  return (
    <article className="customer-booking-card" data-booking-id={booking.id}>
      <div className="customer-booking-card__date">
        <span>{formatBookingDate(booking.startAt, booking.timeZone)}</span>
        <small>{formatBookingTime(booking.startAt, booking.endAt, booking.timeZone)} · {booking.timeZone}</small>
      </div>
      <div className="customer-booking-card__details">
        <p className="editorial-kicker">{appointmentName}</p>
        <h3>{booking.serviceName}</h3>
        <p>{booking.durationMinutes} minutes · {formatPrice(booking.startingPriceCents)}</p>
        <p>Cancellation policy: {formatCancellationPolicy(booking.cancellationCutoffMinutes)}</p>
      </div>
      <div className="customer-booking-card__actions">
        <span>{booking.status === "CANCELED" ? "Canceled" : isPastConfirmed ? "Completed" : "Confirmed"}</span>
        {isCancelable ? <button type="button" onClick={() => onReschedule(booking)}>Reschedule appointment</button> : null}
        {isCancelable ? <button type="button" onClick={(event) => onCancel(booking, event.currentTarget)}>Cancel appointment</button> : null}
        {hasClosedWindow ? <button type="button" disabled>Cancellation window has closed</button> : null}
      </div>
    </article>
  );
}

export function formatBookingDate(startAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(startAt));
}

export function formatBookingTime(startAt: string, endAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(startAt))}–${formatter.format(new Date(endAt))}`;
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatCancellationPolicy(totalMinutes: number) {
  if (totalMinutes <= 0) return "Cancel any time before the appointment starts.";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  return `Cancel at least ${parts.join(" ")} before the appointment.`;
}
