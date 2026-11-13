import type { BookableService } from "@/facades/booking.facade";
import type { MonthAvailability, PublicTechProfile } from "@/services/api";
import { EditorialButton } from "@/components/ui/editorial-ui";
import { formatDate } from "./day-slots";
import { formatPrice } from "./service-picker";

type Slot = MonthAvailability["slots"][number];

export function BookingSummary({ profile, service, slot, cancellationCutoffMinutes, isAuthenticated, isConfirming, onConfirm }: {
  profile: PublicTechProfile;
  service: BookableService;
  slot: Slot;
  cancellationCutoffMinutes: number;
  isAuthenticated: boolean;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <section className="booking-summary" aria-labelledby="booking-summary-heading">
      <div className="booking-summary__heading">
        <p className="editorial-kicker">3 · Final check</p>
        <h2 id="booking-summary-heading">Review appointment</h2>
      </div>
      <dl>
        <div><dt>Technician</dt><dd>{profile.businessName || profile.displayName}</dd></div>
        <div><dt>Service</dt><dd>{service.name}</dd></div>
        <div><dt>Date</dt><dd>{formatDate(slot.localDate)}</dd></div>
        <div><dt>Time</dt><dd>{slot.localTime} · {slot.timeZone}</dd></div>
        <div><dt>Duration</dt><dd>{service.durationMinutes} minutes · ends at {formatAppointmentEnd(slot.startAt, service.durationMinutes, slot.timeZone)}</dd></div>
        <div><dt>Starting price</dt><dd>{formatPrice(service.startingPriceCents)}</dd></div>
        <div><dt>Cancellation</dt><dd>{formatCancellationCutoff(cancellationCutoffMinutes)}</dd></div>
      </dl>
      <EditorialButton onClick={onConfirm} disabled={isConfirming}>
        {isConfirming ? "Confirming…" : isAuthenticated ? "Confirm appointment" : "Sign in to confirm"}
      </EditorialButton>
      <p className="booking-summary__note">Your appointment is confirmed only after avoro accepts this exact time.</p>
    </section>
  );
}

export function formatAppointmentEnd(startAt: string, durationMinutes: number, timeZone: string) {
  const end = new Date(new Date(startAt).getTime() + durationMinutes * 60_000);
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(end);
}

export function formatCancellationCutoff(totalMinutes: number) {
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
