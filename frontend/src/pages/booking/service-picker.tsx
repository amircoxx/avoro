import type { BookableService } from "@/facades/booking.facade";

export function ServicePicker({ services, selectedServiceId, isDisabled = false, onSelectService }: {
  services: BookableService[];
  selectedServiceId: string | null;
  isDisabled?: boolean;
  onSelectService: (serviceId: string) => void;
}) {
  return (
    <fieldset className="booking-services">
      <legend><span>1</span> Select a service</legend>
      <div className="booking-services__list">
        {services.map((service) => (
          <label key={service.id} className="booking-service">
            <input type="radio" name="booking-service" value={service.id} checked={selectedServiceId === service.id} disabled={isDisabled} onChange={() => { if (!isDisabled) onSelectService(service.id); }} />
            <span className="booking-service__mark" aria-hidden="true" />
            <span className="booking-service__copy">
              <strong>{service.name}</strong>
              <small>{service.description || "Service details provided by the technician"}</small>
            </span>
            <span className="booking-service__ledger">
              <strong>{formatPrice(service.startingPriceCents)}</strong>
              <small>{service.durationMinutes} min</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}
