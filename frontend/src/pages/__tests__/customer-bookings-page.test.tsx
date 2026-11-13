import { Window } from "happy-dom";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, type AuthUser, type BookingDto, type CustomerBookings } from "@/services/api";
import type { CustomerBookingsApi } from "../customer-bookings-page";
import CustomerBookingsPage from "../customer-bookings-page";

const { auth, router } = vi.hoisted(() => ({
  auth: { user: null as AuthUser | null, isAuthLoading: false },
  router: { push: vi.fn() }
}));

vi.mock("@/context/account-auth-context", () => ({
  useAccountAuth: () => ({
    authUser: auth.user,
    isAuthLoading: auth.isAuthLoading,
    mode: null,
    openAccountAuth: vi.fn(),
    closeAccountAuth: vi.fn(),
    completeAuthentication: vi.fn(),
    signOut: vi.fn()
  })
}));

vi.mock("@/hooks/router", () => ({ useRouter: () => router }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("CustomerBookingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  afterEach(() => {
    auth.user = null;
    auth.isAuthLoading = false;
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it("waits for auth and routes non-customers away without loading customer history", async () => {
    auth.isAuthLoading = true;
    const api = fakeApi();
    const view = await renderPage(api);
    expect(view.container.textContent).toContain("Loading your bookings");
    expect(api.getCustomerBookings).not.toHaveBeenCalled();

    auth.isAuthLoading = false;
    auth.user = { ...customer(), role: "TECH" };
    await view.rerender();
    expect(router.push).toHaveBeenCalledWith("/");
    expect(api.getCustomerBookings).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("reschedules an appointment and reloads the server's booking groups", async () => {
    auth.user = customer();
    const moved = booking({ startAt: "2026-07-15T15:00:00.000Z", version: 1 });
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValueOnce({ upcoming: [booking()], past: [], canceled: [] })
        .mockResolvedValue({ upcoming: [moved], past: [], canceled: [] }),
      getRescheduleAvailability: vi.fn().mockResolvedValue({ bookingId: "booking-1", version: 0,
        month: "2026-07", timeZone: "America/New_York", slots: [
          { startAt: moved.startAt, localDate: "2026-07-15", localTime: "11:00 AM", timeZone: "America/New_York" }
        ] }),
      rescheduleBooking: vi.fn().mockResolvedValue(moved)
    });
    const view = await renderPage(api);
    await click(view.container, "Reschedule appointment");
    await act(async () => document.querySelector<HTMLButtonElement>('[data-calendar-date="2026-07-15"]')!.click());
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find(b => b.textContent?.includes("11:00 AM"))!.click());
    await act(async () => document.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(api.rescheduleBooking).toHaveBeenCalledWith("booking-1", expect.objectContaining({ startAt: moved.startAt, version: 0 }));
    expect(api.getCustomerBookings).toHaveBeenCalledTimes(2);
    expect(document.querySelector("dialog")).toBeNull();
    expect(view.container.textContent).toContain("Appointment updated.");
    view.cleanup();
  });

  it("preserves the backend groups and their order while showing booking snapshots in the business timezone", async () => {
    auth.user = customer();
    const history = customerBookings();
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue(history) }));
    await waitFor(() => expect(view.container.textContent).toContain("Upcoming"));

    const headings = Array.from(view.container.querySelectorAll("[data-booking-section] h2")).map((heading) => heading.textContent);
    expect(headings).toEqual(["Upcoming", "Past", "Canceled"]);
    expect(view.container.querySelector("[data-booking-section='upcoming']")?.textContent).toContain("Second upcoming");
    expect(view.container.querySelector("[data-booking-section='upcoming']")?.textContent).toContain("First upcoming");
    const upcomingText = view.container.querySelector("[data-booking-section='upcoming']")?.textContent ?? "";
    expect(upcomingText.indexOf("Second upcoming")).toBeLessThan(upcomingText.indexOf("First upcoming"));
    expect(view.container.textContent).toContain("Tuesday, July 14, 2026");
    expect(view.container.textContent).toContain("11:00 AM–12:30 PM · America/New_York");
    expect(view.container.textContent).toContain("Structured manicure");
    expect(view.container.textContent).toContain("$95.00");
    expect(button(view.container, "Cancel appointment").disabled).toBe(false);
    expect(view.container.querySelector("[data-booking-id='past-1']")?.textContent).toContain("Completed");
    expect(view.container.querySelector("[data-booking-id='past-1']")?.textContent).not.toContain("Cancellation window has closed");
    expect(view.container.querySelector("[data-booking-id='canceled-1']")?.textContent).toContain("Canceled");
    expect(view.container.querySelector("[data-booking-id='canceled-1']")?.textContent).toContain("Cancellation policy: Cancel at least 1 day before the appointment.");
    view.cleanup();
  });

  it("shows all three server-group empty states without recomputing a browser status", async () => {
    auth.user = customer();
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [], past: [], canceled: [] }) }));
    await waitFor(() => expect(view.container.textContent).toContain("No upcoming appointments yet"));

    expect(view.container.textContent).toContain("Your completed appointments will appear here.");
    expect(view.container.textContent).toContain("Canceled appointments will appear here.");
    view.cleanup();
  });

  it("disables cancellation from the server snapshot when the customer cutoff has passed", async () => {
    auth.user = customer();
    const unavailable = booking({ id: "deadline-1", canCancel: false });
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [unavailable], past: [], canceled: [] }) }));
    await waitFor(() => expect(view.container.textContent).toContain("Cancellation window has closed"));

    const action = button(view.container, "Cancellation window has closed");
    expect(action.disabled).toBe(true);
    view.cleanup();
  });

  it("updates cancellation availability at the exact snapshotted cutoff while the page stays mounted", async () => {
    vi.setSystemTime(new Date("2026-07-13T14:59:59.000Z"));
    auth.user = customer();
    const deadlineBooking = booking({ startAt: "2026-07-13T15:01:00.000Z", endAt: "2026-07-13T16:31:00.000Z", cancellationCutoffMinutes: 1, canCancel: true });
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [deadlineBooking], past: [], canceled: [] }) }));
    await flush();
    expect(button(view.container, "Cancel appointment").disabled).toBe(false);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(button(view.container, "Cancellation window has closed").disabled).toBe(true);
    view.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("updates a still-mounted confirmed appointment to completed once its snapshotted start arrives", async () => {
    vi.setSystemTime(new Date("2026-07-13T14:59:59.000Z"));
    auth.user = customer();
    const appointment = booking({ startAt: "2026-07-13T15:00:00.000Z", endAt: "2026-07-13T16:30:00.000Z", cancellationCutoffMinutes: 0, canCancel: true });
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [appointment], past: [], canceled: [] }) }));
    await flush();
    expect(button(view.container, "Cancel appointment")).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(view.container.querySelector("[data-booking-id='booking-1']")?.textContent).toContain("Completed");
    expect(view.container.querySelector("[data-booking-id='booking-1']")?.textContent).not.toContain("Cancellation window has closed");
    view.cleanup();
  });

  it("reschedules capped long delays until the cancellation boundary arrives", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    auth.user = customer();
    const longDelay = 2_147_483_647 + 1_000;
    const appointment = booking({
      startAt: new Date(Date.now() + longDelay).toISOString(),
      endAt: new Date(Date.now() + longDelay + 90 * 60_000).toISOString(),
      cancellationCutoffMinutes: 0,
      canCancel: true
    });
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [appointment], past: [], canceled: [] }) }));
    await flush();
    expect(button(view.container, "Cancel appointment")).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_147_483_647); });
    expect(button(view.container, "Cancel appointment")).not.toBeNull();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(view.container.querySelector("[data-booking-id='booking-1']")?.textContent).toContain("Completed");
    view.cleanup();
  });

  it("confirms cancellation, reloads server groups, and moves the booking into canceled", async () => {
    auth.user = customer();
    const initial = { upcoming: [booking()], past: [], canceled: [] };
    const updated = { upcoming: [], past: [], canceled: [{ ...booking(), status: "CANCELED", canCancel: false, canceledAt: "2026-07-01T12:00:00.000Z" }] };
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(updated),
      cancelBooking: vi.fn().mockResolvedValue(updated.canceled[0])
    });
    const view = await renderPage(api);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");

    const dialog = view.container.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.textContent).toContain("Cancel appointment?");
    expect(dialog.textContent).toContain("keep this appointment and choose Reschedule appointment");
    await click(dialog, "Cancel appointment");
    await waitFor(() => expect(api.cancelBooking).toHaveBeenCalledWith("booking-1"));
    await waitFor(() => expect(view.container.querySelector("[data-booking-section='canceled']")?.textContent).toContain("Structured manicure"));
    expect(view.container.querySelector("[role='dialog']")).toBeNull();
    expect(api.getCustomerBookings).toHaveBeenCalledTimes(2);
    view.cleanup();
  });

  it("retains the selected booking and a stable cutoff error when the server rejects cancellation", async () => {
    auth.user = customer();
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [booking()], past: [], canceled: [] }),
      cancelBooking: vi.fn().mockRejectedValue(new ApiClientError({ status: 409, code: "cancellation_cutoff_passed", message: "A different server message" }))
    });
    const view = await renderPage(api);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");
    const dialog = view.container.querySelector<HTMLElement>("[role='dialog']")!;
    await click(dialog, "Cancel appointment");

    await waitFor(() => expect(dialog.querySelector("[role='alert']")?.textContent).toContain("cancellation cutoff has passed"));
    expect(dialog.textContent).toContain("Structured manicure");
    expect(api.getCustomerBookings).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(dialog.querySelector("[role='alert']"));
    view.cleanup();
  });

  it("lets a customer retry an ambiguous cancellation and accepts the server's idempotent canceled response", async () => {
    auth.user = customer();
    const canceled = { ...booking(), status: "CANCELED" as const, canCancel: false, canceledAt: "2026-07-01T12:00:00.000Z" };
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValueOnce({ upcoming: [booking()], past: [], canceled: [] }).mockResolvedValueOnce({ upcoming: [], past: [], canceled: [canceled] }),
      cancelBooking: vi.fn().mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValueOnce(canceled)
    });
    const view = await renderPage(api);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");
    const dialog = view.container.querySelector<HTMLElement>("[role='dialog']")!;
    await click(dialog, "Cancel appointment");
    await waitFor(() => expect(dialog.querySelector("[role='alert']")?.textContent).toContain("Connection interrupted"));
    await click(dialog, "Cancel appointment");

    await waitFor(() => expect(api.cancelBooking).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.container.querySelector("[data-booking-section='canceled']")?.textContent).toContain("Structured manicure"));
    view.cleanup();
  });

  it("prevents a second cancellation while the first request is pending", async () => {
    auth.user = customer();
    const cancellation = deferred<BookingDto>();
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [booking()], past: [], canceled: [] }),
      cancelBooking: vi.fn().mockReturnValue(cancellation.promise)
    });
    const view = await renderPage(api);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");
    const dialog = view.container.querySelector<HTMLElement>("[role='dialog']")!;
    await click(dialog, "Cancel appointment");
    const pending = button(dialog, "Canceling…");
    expect(pending.disabled).toBe(true);
    pending.click();
    expect(api.cancelBooking).toHaveBeenCalledTimes(1);
    cancellation.resolve({ ...booking(), status: "CANCELED", canCancel: false });
    await flush();
    view.cleanup();
  });

  it("restores focus to the exact trigger after a successful cancellation before the refreshed group replaces it", async () => {
    auth.user = customer();
    const refreshed = deferred<CustomerBookings>();
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockResolvedValueOnce({ upcoming: [booking()], past: [], canceled: [] }).mockReturnValueOnce(refreshed.promise),
      cancelBooking: vi.fn().mockResolvedValue({ ...booking(), status: "CANCELED", canCancel: false })
    });
    const view = await renderPage(api);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    const trigger = button(view.container, "Cancel appointment");
    await click(view.container, "Cancel appointment");
    await click(view.container.querySelector<HTMLElement>("[role='dialog']")!, "Cancel appointment");

    await waitFor(() => expect(api.cancelBooking).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(trigger);
    refreshed.resolve({ upcoming: [], past: [], canceled: [{ ...booking(), status: "CANCELED", canCancel: false, canceledAt: "2026-07-01T12:00:00.000Z" }] });
    await flush();
    view.cleanup();
  });

  it("contains Tab focus, restores the exact trigger on close, and lets Escape keep the appointment", async () => {
    auth.user = customer();
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [booking()], past: [], canceled: [] }) }));
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");
    const dialog = view.container.querySelector<HTMLElement>("[role='dialog']")!;

    expect(document.activeElement?.textContent?.trim()).toBe("Cancel appointment");
    const keep = button(dialog, "Keep appointment");
    const confirm = button(dialog, "Cancel appointment");
    await act(async () => confirm.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(keep);
    await act(async () => keep.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(confirm);
    await act(async () => dialog.querySelector("button")?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(view.container.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel appointment");
    view.cleanup();
  });

  it("uses a non-tabbable visual backdrop while dialog controls remain keyboard reachable", async () => {
    auth.user = customer();
    const view = await renderPage(fakeApi({ getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [booking()], past: [], canceled: [] }) }));
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");

    const backdrop = view.container.querySelector<HTMLElement>(".customer-cancel-dialog__backdrop")!;
    expect(backdrop.tagName).not.toBe("BUTTON");
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop.getAttribute("tabindex")).toBe("-1");
    expect(button(view.container.querySelector<HTMLElement>("[role='dialog']")!, "Keep appointment")).not.toBeNull();
    view.cleanup();
  });

  it("invalidates a late history request when authentication changes away from the customer", async () => {
    auth.user = customer();
    const lateHistory = deferred<CustomerBookings>();
    const api = fakeApi({ getCustomerBookings: vi.fn().mockReturnValue(lateHistory.promise) });
    const view = await renderPage(api);
    auth.user = { ...customer(), role: "TECH" };
    await view.rerender();
    lateHistory.resolve({ upcoming: [booking()], past: [], canceled: [] });
    await flush();

    expect(router.push).toHaveBeenCalledWith("/");
    expect(view.container.textContent).not.toContain("Structured manicure");
    view.cleanup();
  });

  it("redirects an unauthenticated visitor before requesting customer bookings", async () => {
    const api = fakeApi();
    const view = await renderPage(api);
    expect(router.push).toHaveBeenCalledWith("/");
    expect(api.getCustomerBookings).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("clears customer A's detail and dialog immediately when customer B renders with the same api", async () => {
    auth.user = customer();
    const bookingsB = deferred<CustomerBookings>();
    const getCustomerBookings = vi.fn()
      .mockResolvedValueOnce({ upcoming: [booking({ id: "booking-a", serviceName: "A service" })], past: [], canceled: [] })
      .mockReturnValueOnce(bookingsB.promise);
    const firstApi = fakeApi({ getCustomerBookings });
    const view = await renderPage(firstApi);
    await waitFor(() => expect(button(view.container, "Cancel appointment")).not.toBeNull());
    await click(view.container, "Cancel appointment");
    expect(view.container.querySelector("[role='dialog']")).not.toBeNull();

    auth.user = customerB();
    const immediate = view.rerenderImmediately(firstApi);
    expect(immediate.text).not.toContain("A service");
    expect(immediate.hasDialog).toBe(false);
    bookingsB.resolve({ upcoming: [booking({ id: "booking-b", serviceName: "B service", customerId: "customer-2" })], past: [], canceled: [] });
    await flush();

    expect(view.container.textContent).toContain("B service");
    expect(view.container.textContent).not.toContain("A service");
    view.cleanup();
  });

  it("does not flash customer A's load error when customer B renders directly with the same api", async () => {
    auth.user = customer();
    const bookingsB = deferred<CustomerBookings>();
    const api = fakeApi({
      getCustomerBookings: vi.fn().mockRejectedValueOnce(new Error("A-only booking load error")).mockReturnValueOnce(bookingsB.promise)
    });
    const view = await renderPage(api);
    await waitFor(() => expect(view.container.textContent).toContain("A-only booking load error"));

    auth.user = customerB();
    const immediate = view.rerenderImmediately(api);
    expect(immediate.text).not.toContain("A-only booking load error");
    bookingsB.resolve({ upcoming: [], past: [], canceled: [] });
    await flush();
    view.cleanup();
  });
});

function fakeApi(overrides: Partial<CustomerBookingsApi> = {}): CustomerBookingsApi {
  return {
    getCustomerBookings: vi.fn().mockResolvedValue({ upcoming: [], past: [], canceled: [] }),
    cancelBooking: vi.fn().mockResolvedValue({}),
    getRescheduleAvailability: vi.fn(),
    rescheduleBooking: vi.fn(),
    ...overrides
  } as CustomerBookingsApi;
}

function customer(): AuthUser {
  return { id: "customer-1", email: "avery@example.com", role: "CUSTOMER", fullName: "Avery", avatarUrl: null };
}

function customerB(): AuthUser {
  return { id: "customer-2", email: "bryn@example.com", role: "CUSTOMER", fullName: "Bryn", avatarUrl: null };
}

function customerBookings(): CustomerBookings {
  return {
    upcoming: [booking({ id: "upcoming-2", serviceName: "Second upcoming" }), booking({ id: "booking-1", serviceName: "First upcoming" })],
    past: [booking({ id: "past-1", startAt: "2025-07-14T15:00:00.000Z", endAt: "2025-07-14T16:30:00.000Z", canCancel: false })],
    canceled: [booking({ id: "canceled-1", status: "CANCELED", canCancel: false, canceledAt: "2026-07-01T12:00:00.000Z" })]
  };
}

function booking(overrides: Partial<BookingDto> = {}): BookingDto {
  return {
    version: 0,
    id: "booking-1", techProfileId: "tech-1", customerId: "customer-1", serviceId: "service-1", requestKey: "request-1",
    serviceName: "Structured manicure", durationMinutes: 90, startingPriceCents: 9500, timeZone: "America/New_York", cancellationCutoffMinutes: 1440,
    startAt: "2026-07-14T15:00:00.000Z", endAt: "2026-07-14T16:30:00.000Z", blockedUntilAt: "2026-07-14T16:30:00.000Z",
    status: "CONFIRMED", canceledAt: null, createdAt: "2026-06-01T12:00:00.000Z", updatedAt: "2026-06-01T12:00:00.000Z",
    tech: { id: "tech-1", businessName: "The Nail Study", displayName: "Mia Chen" }, customer: { id: "customer-1", displayName: "Avery" }, canCancel: true,
    ...overrides
  };
}

async function renderPage(api: CustomerBookingsApi) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, KeyboardEvent: window.KeyboardEvent });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<CustomerBookingsPage api={api} />); });
  return {
    container,
    cleanup: () => { act(() => root.unmount()); window.close(); },
    rerender: async (nextApi = api) => { await act(async () => { root.render(<CustomerBookingsPage api={nextApi} />); }); },
    rerenderImmediately: (nextApi = api) => {
      let snapshot!: { text: string; hasDialog: boolean };
      act(() => {
        flushSync(() => root.render(<CustomerBookingsPage api={nextApi} />));
        snapshot = { text: container.textContent ?? "", hasDialog: container.querySelector("[role='dialog']") !== null };
      });
      return snapshot;
    }
  };
}

async function click(container: ParentNode, label: string) {
  await act(async () => { button(container, label).click(); });
}

function button(container: ParentNode, label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found as HTMLButtonElement;
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { assertion(); return; } catch (error) { if (attempt === 19) throw error; await flush(); }
  }
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
