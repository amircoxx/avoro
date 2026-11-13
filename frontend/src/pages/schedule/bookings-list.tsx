import type { CalendarBookingPlacement } from "./bookings-calendar";

/** The calendar's single semantic appointment collection; the visual grids are presentation-only. */
export function BookingsList({ placements, timeZone, selectedBookingId, onSelect }: {
  placements: CalendarBookingPlacement[];
  timeZone: string;
  selectedBookingId: string | null;
  onSelect: (bookingId: string) => void;
}) {
  const groups = groupByDate(placements);

  return (
    <section className="schedule-bookings-list" aria-label="Appointments by date">
      {groups.length === 0 ? <p className="schedule-bookings-list__empty">No appointments in this range.</p> : groups.map(([localDate, items]) => (
        <section key={localDate} className="schedule-bookings-list__day" aria-labelledby={`schedule-booking-date-${localDate}`}>
          <h3 id={`schedule-booking-date-${localDate}`}>{formatDateHeading(localDate)}</h3>
          <ul>
            {items.map(({ booking }) => (
              <li key={booking.id} className={booking.status === "CANCELED" ? "is-canceled" : undefined}>
                <button
                  type="button"
                  data-booking-id={booking.id}
                  aria-pressed={selectedBookingId === booking.id}
                  onClick={() => onSelect(booking.id)}
                >
                  <span>{formatTimeRange(booking.startAt, booking.endAt, timeZone)}</span>
                  <strong>{booking.serviceName}</strong>
                  <small>{booking.status === "CANCELED" ? "Canceled" : "Confirmed"}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

function groupByDate(placements: CalendarBookingPlacement[]) {
  const groups = new Map<string, CalendarBookingPlacement[]>();
  for (const placement of placements) {
    const group = groups.get(placement.localDate) ?? [];
    group.push(placement);
    groups.set(placement.localDate, group);
  }
  return [...groups.entries()];
}

function formatDateHeading(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimeRange(startAt: string, endAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(startAt))}–${formatter.format(new Date(endAt))}`;
}
