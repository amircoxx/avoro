import type { BookingDto } from "@/services/api";
import { BookingDetail } from "./booking-detail";

export function BookingList({ title, bookings, emptyMessage, now, onCancel, onReschedule }: {
  title: "Upcoming" | "Past" | "Canceled";
  bookings: BookingDto[];
  emptyMessage: string;
  now: number;
  onReschedule: (booking: BookingDto) => void;
  onCancel: (booking: BookingDto, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="customer-bookings__section" data-booking-section={title.toLowerCase()} aria-labelledby={`customer-bookings-${title.toLowerCase()}`}>
      <div className="customer-bookings__section-heading"><h2 id={`customer-bookings-${title.toLowerCase()}`}>{title}</h2><span>{bookings.length}</span></div>
      {bookings.length === 0 ? <p className="customer-bookings__empty">{emptyMessage}</p> : <div className="customer-bookings__list">{bookings.map((booking) => <BookingDetail key={booking.id} booking={booking} now={now} onCancel={onCancel} onReschedule={onReschedule} />)}</div>}
    </section>
  );
}
