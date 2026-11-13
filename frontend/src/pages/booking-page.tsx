/** Customer-facing month booking flow with auth resume and conflict recovery. */
import { CalendarCheck, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccountAuth } from "@/context/account-auth-context";
import { EditorialButton } from "@/components/ui/editorial-ui";
import { defaultBookingFacade, type BookingFacade, type BookableService } from "@/facades/booking.facade";
import { useParams, useRouter } from "@/hooks/router";
import type { MonthAvailability, PublicTechProfile } from "@/services/api";
import { BookingSummary } from "./booking/booking-summary";
import { DaySlots } from "./booking/day-slots";
import { MonthCalendar } from "./booking/month-calendar";
import { ServicePicker } from "./booking/service-picker";

type AvailabilitySlot = MonthAvailability["slots"][number];

export default function BookingPage({ facade = defaultBookingFacade, initialMonth }: { facade?: BookingFacade; initialMonth?: string }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { mode: authMode, authUser, isAuthLoading, openAccountAuth } = useAccountAuth();
  const [profile, setProfile] = useState<PublicTechProfile | null>(null);
  const [services, setServices] = useState<BookableService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [month, setMonth] = useState(initialMonth ?? "");
  const [availability, setAvailability] = useState<MonthAvailability | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const availabilityGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const bookingScopeGeneration = useRef(0);
  const confirmationGeneration = useRef(0);
  const isConfirmingRef = useRef(false);
  const pendingAuthentication = useRef(false);
  const bookingAuthWasOpen = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const previousRouteTechId = useRef(id);
  const previousAuthIdentity = useRef(authUser ? `${authUser.role}:${authUser.id}` : null);
  const activeRouteTechId = useRef(id);
  const activeCustomerId = useRef(authUser?.role === "CUSTOMER" ? authUser.id : null);
  activeRouteTechId.current = id;
  activeCustomerId.current = authUser?.role === "CUSTOMER" ? authUser.id : null;

  useEffect(() => {
    let active = true;
    const routeChanged = previousRouteTechId.current !== id;
    previousRouteTechId.current = id;
    if (routeChanged) {
      invalidatePendingConfirmation();
      availabilityGeneration.current += 1;
      selectionGeneration.current += 1;
      setProfile(null);
      setServices([]);
      setSelectedServiceId(null);
      setMonth(initialMonth ?? "");
      setAvailability(null);
      setSelectedDate(null);
      setSelectedStartAt(null);
      setIsLoadingMonth(false);
      setIsLoadingProfile(true);
    }
    if (!id) {
      setError("Artist booking details could not be loaded.");
      setIsLoadingProfile(false);
      return;
    }
    void facade.loadBookingPage(id)
      .then((data) => {
        if (!active) return;
        setProfile(data.profile);
        setServices(data.services);
        if (!initialMonth) setMonth(monthInTimeZone(new Date(), data.profile.bookingTimeZone));
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError, "Artist booking details could not be loaded."));
      })
      .finally(() => { if (active) setIsLoadingProfile(false); });
    return () => { active = false; };
  }, [facade, id, initialMonth]);

  useEffect(() => {
    const identity = authUser ? `${authUser.role}:${authUser.id}` : null;
    const previous = previousAuthIdentity.current;
    if (previous === identity) return;
    previousAuthIdentity.current = identity;
    if (previous !== null) invalidatePendingConfirmation();
  }, [authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!id || !selectedServiceId || !month) return;
    const generation = ++availabilityGeneration.current;
    setIsLoadingMonth(true);
    setAvailability(null);
    void facade.loadMonth(id, selectedServiceId, month)
      .then((nextAvailability) => {
        if (availabilityGeneration.current === generation) setAvailability(nextAvailability);
      })
      .catch((loadError) => {
        if (availabilityGeneration.current === generation) setError(errorMessage(loadError, "Availability could not be loaded."));
      })
      .finally(() => {
        if (availabilityGeneration.current === generation) setIsLoadingMonth(false);
      });
  }, [facade, id, month, selectedServiceId]);

  useEffect(() => {
    if (!pendingAuthentication.current) return;
    if (authMode !== null) {
      bookingAuthWasOpen.current = true;
      return;
    }
    if (authUser) {
      pendingAuthentication.current = false;
      bookingAuthWasOpen.current = false;
      if (authUser.role !== "CUSTOMER") {
        showFocusedError("Use a customer account to confirm an appointment.");
        return;
      }
      void submitBooking();
      return;
    }
    if (bookingAuthWasOpen.current) {
      pendingAuthentication.current = false;
      bookingAuthWasOpen.current = false;
    }
  }, [authMode, authUser]);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error, isLoadingProfile, profile]);

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? null;
  const availableDates = useMemo(() => Array.from(new Set(availability?.slots.map((slot) => slot.localDate) ?? [])), [availability]);
  const daySlots = availability?.slots.filter((slot) => slot.localDate === selectedDate) ?? [];
  const selectedSlot = availability?.slots.find((slot) => slot.startAt === selectedStartAt) ?? null;

  function clearSelectionAfterServiceOrMonthChange() {
    selectionGeneration.current += 1;
    bookingScopeGeneration.current += 1;
    confirmationGeneration.current += 1;
    availabilityGeneration.current += 1;
    pendingAuthentication.current = false;
    bookingAuthWasOpen.current = false;
    setSelectedDate(null);
    setSelectedStartAt(null);
    setAvailability(null);
    setConfirmedBookingId(null);
    setError("");
  }

  function selectService(serviceId: string) {
    if (isConfirmingRef.current) return;
    clearSelectionAfterServiceOrMonthChange();
    setSelectedServiceId(serviceId);
  }

  function changeMonth(offset: number) {
    if (isConfirmingRef.current) return;
    clearSelectionAfterServiceOrMonthChange();
    setMonth((current) => shiftMonth(current, offset));
  }

  function selectDate(date: string) {
    if (isConfirmingRef.current) return;
    selectionGeneration.current += 1;
    setSelectedDate(date);
    setSelectedStartAt(null);
    setConfirmedBookingId(null);
    setError("");
  }

  function selectSlot(slot: AvailabilitySlot) {
    if (isConfirmingRef.current) return;
    selectionGeneration.current += 1;
    setSelectedStartAt(slot.startAt);
    setConfirmedBookingId(null);
    setError("");
  }

  function requestConfirmation() {
    if (!selectedSlot || !selectedService || !profile || isConfirmingRef.current) return;
    if (isAuthLoading) {
      showFocusedError("Your account is still loading. Try again in a moment.");
      return;
    }
    if (!authUser) {
      pendingAuthentication.current = true;
      openAccountAuth("login");
      return;
    }
    if (authUser.role !== "CUSTOMER") {
      showFocusedError("Use a customer account to confirm an appointment.");
      return;
    }
    void submitBooking();
  }

  async function submitBooking() {
    const customerIdAtSubmit = activeCustomerId.current;
    const techIdAtSubmit = id;
    if (!techIdAtSubmit || !customerIdAtSubmit || !selectedServiceId || !selectedSlot || isConfirmingRef.current) return;
    const generation = ++confirmationGeneration.current;
    const selectionAtSubmit = selectionGeneration.current;
    const scopeAtSubmit = bookingScopeGeneration.current;
    const serviceAtSubmit = selectedServiceId;
    const monthAtSubmit = month;
    const startAtSubmit = selectedSlot.startAt;
    isConfirmingRef.current = true;
    setIsConfirming(true);
    setError("");
    try {
      const result = await facade.confirmBooking({
        customerId: customerIdAtSubmit,
        techProfileId: techIdAtSubmit,
        serviceId: serviceAtSubmit,
        startAt: selectedSlot.startAt,
        month: monthAtSubmit
      });
      const ownerScopeIsCurrent = activeCustomerId.current === customerIdAtSubmit
        && activeRouteTechId.current === techIdAtSubmit;
      const isCurrent = confirmationGeneration.current === generation
        && selectionGeneration.current === selectionAtSubmit
        && selectedServiceId === serviceAtSubmit
        && month === monthAtSubmit
        && ownerScopeIsCurrent;
      if (result.kind === "confirmed") {
        if (!ownerScopeIsCurrent) return;
        if (result.booking.customerId !== customerIdAtSubmit) {
          throw new Error("Booking confirmation owner did not match the signed-in customer");
        }
        setConfirmedBookingId(result.booking.id);
        return;
      }
      if (!isCurrent) return;
      setAvailability((current) => current ? withoutSlot(current, startAtSubmit) : current);
      setSelectedStartAt(null);
      const conflictMessage = result.message || "That time was just booked. Choose another time.";
      showFocusedError(conflictMessage);
      refreshMonthAfterConflict(id, serviceAtSubmit, monthAtSubmit, scopeAtSubmit, startAtSubmit, conflictMessage);
    } catch (confirmationError) {
      if (confirmationGeneration.current === generation
        && activeCustomerId.current === customerIdAtSubmit
        && activeRouteTechId.current === techIdAtSubmit) {
        showFocusedError(errorMessage(confirmationError, "Booking could not be confirmed. Try again."));
      }
    } finally {
      if (confirmationGeneration.current === generation) {
        isConfirmingRef.current = false;
        setIsConfirming(false);
      }
    }
  }

  function invalidatePendingConfirmation() {
    confirmationGeneration.current += 1;
    bookingScopeGeneration.current += 1;
    isConfirmingRef.current = false;
    pendingAuthentication.current = false;
    bookingAuthWasOpen.current = false;
    setIsConfirming(false);
    setConfirmedBookingId(null);
    setError("");
  }

  function showFocusedError(message: string) {
    setError(message);
  }

  function refreshMonthAfterConflict(techId: string, serviceId: string, selectedMonth: string, scopeAtSubmit: number, conflictedStartAt: string, conflictMessage: string) {
    const generation = ++availabilityGeneration.current;
    setIsLoadingMonth(true);
    void facade.loadMonth(techId, serviceId, selectedMonth)
      .then((nextAvailability) => {
        if (availabilityGeneration.current === generation && bookingScopeGeneration.current === scopeAtSubmit) {
          setAvailability(withoutSlot(nextAvailability, conflictedStartAt));
        }
      })
      .catch(() => {
        if (availabilityGeneration.current === generation && bookingScopeGeneration.current === scopeAtSubmit) {
          showFocusedError(`${conflictMessage} Availability could not be refreshed; try this month again.`);
        }
      })
      .finally(() => {
        if (availabilityGeneration.current === generation) setIsLoadingMonth(false);
      });
  }

  if (isLoadingProfile) {
    return <main className="editorial-page booking-page"><p className="booking-page__loading">Loading appointment book…</p></main>;
  }

  if (!profile || !id) {
    return (
      <main className="editorial-page booking-page booking-page--empty">
        <div ref={alertRef} role="alert" tabIndex={-1}>{error || "Artist booking details could not be loaded."}</div>
        <EditorialButton onClick={() => router.push("/discover")}>Browse artists</EditorialButton>
      </main>
    );
  }

  if (!profile.bookingEnabled || services.length === 0) {
    return (
      <main className="editorial-page booking-page booking-page--empty">
        <p className="editorial-kicker">Appointments</p>
        <h1 className="editorial-display">Booking unavailable</h1>
        <p>{profile.businessName || profile.displayName} is not accepting direct bookings right now. Use the contact methods on the profile instead.</p>
        <EditorialButton onClick={() => router.push(`/artists/${id}`)}>Back to profile</EditorialButton>
      </main>
    );
  }

  return (
    <main className="editorial-page booking-page">
      <button type="button" className="booking-page__back" disabled={isConfirming} onClick={() => { if (!isConfirmingRef.current) router.push(`/artists/${id}`); }}>← Back to profile</button>
      <header className="booking-page__masthead">
        <div>
          <p className="editorial-kicker">Appointment book</p>
          <h1 className="editorial-display">Book with {profile.businessName || profile.displayName}</h1>
        </div>
        <p><MapPin aria-hidden="true" /> {profile.publicLocationLabel}</p>
      </header>

      {error ? <div ref={alertRef} className="booking-page__alert" role="alert" tabIndex={-1}>{error}</div> : null}

      {confirmedBookingId ? (
        <section className="booking-confirmed" aria-live="polite">
          <CalendarCheck aria-hidden="true" />
          <div><p className="editorial-kicker">Reserved</p><h2 className="editorial-display">Appointment confirmed</h2><p>Your time is secured. You can review the booking and cancellation policy in your account.</p></div>
          <EditorialButton onClick={() => router.push("/bookings")}>View my bookings</EditorialButton>
        </section>
      ) : (
        <>
          <ServicePicker services={services} selectedServiceId={selectedServiceId} isDisabled={isConfirming} onSelectService={selectService} />

          <section className="booking-time" aria-labelledby="booking-time-heading">
            <div className="booking-time__heading"><span>2</span><div><h2 id="booking-time-heading">Choose a time</h2><p>Open dates come directly from the technician’s appointment book.</p></div></div>
            {selectedServiceId ? (
              <div className="booking-calendar-layout" data-booking-calendar-layout>
                <MonthCalendar month={month} availableDates={availableDates} selectedDate={selectedDate} timeZone={availability?.timeZone ?? profile.bookingTimeZone} isDisabled={isConfirming} onSelectDate={selectDate} onPreviousMonth={() => changeMonth(-1)} onNextMonth={() => changeMonth(1)} />
                <DaySlots selectedDate={selectedDate} slots={daySlots} selectedStartAt={selectedStartAt} timeZone={availability?.timeZone ?? null} isLoading={isLoadingMonth} isDisabled={isConfirming} onSelectSlot={selectSlot} />
              </div>
            ) : <p className="booking-time__prompt">Select a service to open the calendar.</p>}
          </section>

          {selectedService && selectedSlot && availability ? <BookingSummary profile={profile} service={selectedService} slot={selectedSlot} cancellationCutoffMinutes={availability.cancellationCutoffMinutes} isAuthenticated={Boolean(authUser)} isConfirming={isConfirming} onConfirm={requestConfirmation} /> : null}
        </>
      )}
    </main>
  );
}

function monthInTimeZone(date: Date, timeZone: string | null) {
  if (!timeZone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    return year && month ? `${year}-${month}` : "";
  } catch {
    return "";
  }
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function withoutSlot(availability: MonthAvailability, startAt: string): MonthAvailability {
  return { ...availability, slots: availability.slots.filter((slot) => slot.startAt !== startAt) };
}
