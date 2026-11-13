import type { MonthAvailability } from "@/services/api";

type Slot = MonthAvailability["slots"][number];

export function DaySlots({ selectedDate, slots, selectedStartAt, timeZone, isLoading, isDisabled = false, onSelectSlot }: {
  selectedDate: string | null;
  slots: Slot[];
  selectedStartAt: string | null;
  timeZone: string | null;
  isLoading: boolean;
  isDisabled?: boolean;
  onSelectSlot: (slot: Slot) => void;
}) {
  return (
    <section className="booking-slots" data-booking-slots aria-labelledby="booking-slots-heading">
      <div className="booking-slots__heading">
        <p className="editorial-kicker">Selected day</p>
        <h2 id="booking-slots-heading">{selectedDate ? formatDate(selectedDate) : "Choose an open date"}</h2>
        {timeZone ? <p>Times shown in {timeZone}</p> : null}
      </div>
      <div className="booking-slots__list" aria-live="polite" aria-busy={isLoading}>
        {isLoading ? <p>Loading exact times…</p> : null}
        {!isLoading && !selectedDate ? <p>Select an open date in the month to see exact times.</p> : null}
        {!isLoading && selectedDate && slots.length === 0 ? <p>No times remain for this date. Choose another open date.</p> : null}
        {!isLoading && slots.map((slot) => (
          <button key={slot.startAt} type="button" disabled={isDisabled} aria-pressed={selectedStartAt === slot.startAt} onClick={() => { if (!isDisabled) onSelectSlot(slot); }}>
            <span>{slot.localTime}</span><small>{selectedStartAt === slot.startAt ? "Selected" : "Available"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function formatDate(localDate: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${localDate}T12:00:00.000Z`));
}
