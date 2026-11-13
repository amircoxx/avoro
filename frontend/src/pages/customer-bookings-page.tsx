/** Customer-owned appointment ledger and cancellation flow. */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useAccountAuth } from "@/context/account-auth-context";
import { EditorialButton } from "@/components/ui/editorial-ui";
import * as bookingsApi from "@/services/api/bookings";
import { useRouter } from "@/hooks/router";
import { ApiClientError, type BookingDto, type CustomerBookings } from "@/services/api";
import { RescheduleDialog } from "./booking/reschedule-dialog";
import { BookingList } from "./customer-bookings/booking-list";

const emptyBookings: CustomerBookings = { upcoming: [], past: [], canceled: [] };
const maximumTimeoutDelay = 2_147_483_647;
type OwnedBookingSelection = { ownerId: string; booking: BookingDto };
type OwnedLoadError = { ownerId: string; message: string };

export type CustomerBookingsApi = Pick<typeof bookingsApi, "getCustomerBookings" | "cancelBooking" | "getRescheduleAvailability" | "rescheduleBooking">;

export default function CustomerBookingsPage({ api = bookingsApi }: { api?: CustomerBookingsApi }) {
  const { authUser, isAuthLoading } = useAccountAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<CustomerBookings>(emptyBookings);
  const [bookingsOwnerId, setBookingsOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<OwnedLoadError | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<OwnedBookingSelection | null>(null);
  const [rescheduling, setRescheduling] = useState<OwnedBookingSelection | null>(null);
  const [success, setSuccess] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestGeneration = useRef(0);
  const cancellationGeneration = useRef(0);
  const dialogConfirmRef = useRef<HTMLButtonElement>(null);
  const cancellationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const visibleBookings = bookingsOwnerId === authUser?.id ? bookings : emptyBookings;
  const activeSelectedBooking = selectedBooking && selectedBooking.ownerId === authUser?.id ? selectedBooking.booking : null;
  const activeRescheduling = rescheduling && rescheduling.ownerId === authUser?.id
    ? visibleBookings.upcoming.find(booking => booking.id === rescheduling.booking.id) ?? rescheduling.booking : null;
  const activeLoadError = loadError && loadError.ownerId === authUser?.id ? loadError.message : null;

  useEffect(() => {
    requestGeneration.current += 1;
    cancellationGeneration.current += 1;
    setBookings(emptyBookings);
    setBookingsOwnerId(null);
    setSelectedBooking(null);
    setRescheduling(null);
    setSuccess("");
    setCancellationError("");
    setLoadError(null);
    setIsCanceling(false);
    if (isAuthLoading) return;
    if (!authUser || authUser.role !== "CUSTOMER") {
      router.push("/");
      return;
    }
    setNow(Date.now());
    void reloadBookings(authUser.id);
  }, [authUser?.id, authUser?.role, api, isAuthLoading]);

  useEffect(() => () => {
    requestGeneration.current += 1;
    cancellationGeneration.current += 1;
  }, []);

  useEffect(() => {
    const nextDeadline = visibleBookings.upcoming
      .filter((booking) => booking.status === "CONFIRMED")
      .flatMap((booking) => {
        const startAt = new Date(booking.startAt).getTime();
        return [startAt - booking.cancellationCutoffMinutes * 60_000, startAt];
      })
      .filter((boundary) => boundary > now)
      .sort((left, right) => left - right)[0];
    if (nextDeadline === undefined) return;
    const delay = Math.min(Math.max(0, nextDeadline - Date.now()), maximumTimeoutDelay);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now, visibleBookings.upcoming]);

  useEffect(() => {
    if (!activeSelectedBooking) return;
    dialogConfirmRef.current?.focus();
  }, [activeSelectedBooking]);

  async function reloadBookings(ownerId: string) {
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.getCustomerBookings();
      if (requestGeneration.current === generation) {
        setBookings(response);
        setBookingsOwnerId(ownerId);
      }
    } catch (error) {
      if (requestGeneration.current === generation) setLoadError({ ownerId, message: errorMessage(error, "Your bookings could not be loaded.") });
    } finally {
      if (requestGeneration.current === generation) setIsLoading(false);
    }
  }

  function openCancellation(booking: BookingDto, trigger: HTMLButtonElement) {
    const deadline = new Date(booking.startAt).getTime() - booking.cancellationCutoffMinutes * 60_000;
    if (!booking.canCancel || booking.status !== "CONFIRMED" || Date.now() >= deadline || isCanceling) return;
    cancellationTriggerRef.current = trigger;
    setCancellationError("");
    if (!authUser) return;
    setSelectedBooking({ ownerId: authUser.id, booking });
  }

  function closeCancellation() {
    if (isCanceling) return;
    cancellationGeneration.current += 1;
    setCancellationError("");
    setSelectedBooking(null);
    cancellationTriggerRef.current?.focus();
  }

  async function confirmCancellation() {
    if (!activeSelectedBooking || isCanceling) return;
    const bookingId = activeSelectedBooking.id;
    const generation = ++cancellationGeneration.current;
    setIsCanceling(true);
    setCancellationError("");
    try {
      await api.cancelBooking(bookingId);
      if (cancellationGeneration.current !== generation) return;
      setSelectedBooking(null);
      cancellationTriggerRef.current?.focus();
      if (authUser?.id) await reloadBookings(authUser.id);
    } catch (error) {
      if (cancellationGeneration.current === generation) setCancellationError(cancellationMessage(error));
    } finally {
      if (cancellationGeneration.current === generation) setIsCanceling(false);
    }
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isCanceling) {
      event.preventDefault();
      closeCancellation();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget.querySelector<HTMLElement>("[role='dialog']");
    const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) : [];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement as HTMLButtonElement)) {
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

  if (isAuthLoading) return <main className="editorial-page customer-bookings-page"><p className="customer-bookings-page__loading">Loading your bookings…</p></main>;
  if (!authUser || authUser.role !== "CUSTOMER") return <main className="editorial-page customer-bookings-page"><p className="customer-bookings-page__loading">Opening your account…</p></main>;

  return (
    <main className="editorial-page customer-bookings-page">
      <header className="customer-bookings-page__masthead">
        <p className="editorial-kicker">Appointment register</p>
        <h1 className="editorial-display">My bookings</h1>
        <p>Review confirmed appointments, past visits, and any cancellations in one place.</p>
      </header>
      {success ? <p role="status" className="reschedule-success">{success}</p> : null}
      {activeLoadError ? <div className="customer-bookings-page__alert" role="alert">{activeLoadError}<EditorialButton onClick={() => void reloadBookings(authUser.id)}>Try again</EditorialButton></div> : null}
      {isLoading ? <p className="customer-bookings-page__loading" aria-live="polite">Loading your bookings…</p> : null}
      <div className="customer-bookings" aria-busy={isLoading}>
        <BookingList title="Upcoming" bookings={visibleBookings.upcoming} emptyMessage="No upcoming appointments yet. Explore technicians to find a time that works for you." now={now} onCancel={openCancellation} onReschedule={booking => { setSuccess(""); setRescheduling({ ownerId: authUser.id, booking }); }} />
        <BookingList title="Past" bookings={visibleBookings.past} emptyMessage="Your completed appointments will appear here." now={now} onCancel={openCancellation} onReschedule={booking => { setSuccess(""); setRescheduling({ ownerId: authUser.id, booking }); }} />
        <BookingList title="Canceled" bookings={visibleBookings.canceled} emptyMessage="Canceled appointments will appear here." now={now} onCancel={openCancellation} onReschedule={booking => { setSuccess(""); setRescheduling({ ownerId: authUser.id, booking }); }} />
      </div>
      {activeRescheduling ? <RescheduleDialog key={`${authUser.id}:${activeRescheduling.id}`} booking={activeRescheduling} api={api}
        onClose={() => setRescheduling(null)} onConflict={() => void reloadBookings(authUser.id)}
        onSaved={updated => {
          setRescheduling(null);
          setSuccess("Appointment updated.");
          setBookings(current => ({ ...current, upcoming: current.upcoming.map(booking => booking.id === updated.id ? updated : booking) }));
          void reloadBookings(authUser.id);
        }} /> : null}
      {activeSelectedBooking ? <CancellationDialog booking={activeSelectedBooking} error={cancellationError} isCanceling={isCanceling} confirmRef={dialogConfirmRef} onClose={closeCancellation} onConfirm={() => void confirmCancellation()} onKeyDown={onDialogKeyDown} /> : null}
    </main>
  );
}

function CancellationDialog({ booking, error, isCanceling, confirmRef, onClose, onConfirm, onKeyDown }: {
  booking: BookingDto;
  error: string;
  isCanceling: boolean;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onConfirm: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <div className="customer-cancel-dialog__overlay" onKeyDown={onKeyDown}>
      <div className="customer-cancel-dialog__backdrop" aria-hidden="true" tabIndex={-1} onClick={isCanceling ? undefined : onClose} />
      <section className="customer-cancel-dialog editorial-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title">
        <p className="editorial-kicker">Appointment change</p>
        <h2 id="cancel-booking-title">Cancel appointment?</h2>
        <p><strong>{booking.serviceName}</strong> with {booking.tech.businessName || booking.tech.displayName} will be canceled.</p>
        <p>To change the time instead, keep this appointment and choose Reschedule appointment.</p>
        {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="customer-cancel-dialog__alert">{error}</div> : null}
        <div className="customer-cancel-dialog__actions">
          <button type="button" onClick={onClose} disabled={isCanceling}>Keep appointment</button>
          <button ref={confirmRef} type="button" className="editorial-button editorial-button--primary" onClick={onConfirm} disabled={isCanceling}>{isCanceling ? "Canceling…" : "Cancel appointment"}</button>
        </div>
      </section>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function cancellationMessage(error: unknown) {
  if (error instanceof ApiClientError && error.code === "cancellation_cutoff_passed") {
    return "The cancellation cutoff has passed. This appointment can no longer be canceled online.";
  }
  const message = errorMessage(error, "This appointment could not be canceled. Try again.");
  return /cancellation cutoff has passed/i.test(message) ? "The cancellation cutoff has passed. This appointment can no longer be canceled online." : message;
}
