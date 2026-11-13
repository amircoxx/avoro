import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, MonthAvailability, PublicTechProfile } from "@/services/api";
import type { BookingFacade } from "@/facades/booking.facade";
import BookingPage from "../booking-page";

const { auth, route } = vi.hoisted(() => ({
  auth: {
    user: null as AuthUser | null,
    mode: null as "login" | "register" | null,
    openAccountAuth: vi.fn(),
    closeAccountAuth: vi.fn()
  },
  route: { id: "tech-1" }
}));

vi.mock("@/context/account-auth-context", () => ({
  useAccountAuth: () => ({
    mode: auth.mode,
    authUser: auth.user,
    isAuthLoading: false,
    openAccountAuth: auth.openAccountAuth,
    closeAccountAuth: auth.closeAccountAuth,
    completeAuthentication: vi.fn(),
    signOut: vi.fn()
  })
}));

vi.mock("@/hooks/router", () => ({
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: vi.fn() })
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("BookingPage", () => {
  afterEach(() => {
    auth.user = null;
    auth.mode = null;
    route.id = "tech-1";
    vi.resetAllMocks();
  });

  it("keeps the month before exact server-labeled slots in responsive DOM order", async () => {
    const facade = fakeFacade();
    const view = await renderPage(facade);
    await chooseService(view.container);
    await selectDate(view.container, "2026-07-14");

    const layout = view.container.querySelector("[data-booking-calendar-layout]")!;
    expect(layout.children[0]?.getAttribute("data-booking-month")).not.toBeNull();
    expect(layout.children[1]?.getAttribute("data-booking-slots")).not.toBeNull();
    expect(view.container.textContent).toContain("11:00 AM");
    expect(view.container.textContent).toContain("11:30 AM");
    expect(view.container.textContent).toContain("America/New_York");
    view.cleanup();
  });

  it("clears date, time, and stale async month results when the service changes", async () => {
    const firstMonth = deferred<MonthAvailability>();
    const facade = fakeFacade({
      loadMonth: vi.fn()
        .mockReturnValueOnce(firstMonth.promise)
        .mockResolvedValueOnce(monthAvailability({ serviceId: "service-2", localTime: "2:00 PM", startAt: "2026-07-16T18:00:00.000Z", localDate: "2026-07-16" }))
    });
    const view = await renderPage(facade);

    await click(view.container, "Structured manicure");
    await click(view.container, "Gel removal");
    firstMonth.resolve(monthAvailability());
    await flush();

    expect(view.container.querySelector("[aria-selected='true']")).toBeNull();
    await waitFor(() => expect(view.container.querySelector<HTMLButtonElement>("[data-calendar-date='2026-07-16']")?.disabled).toBe(false));
    await selectDate(view.container, "2026-07-16");

    expect(view.container.textContent).toContain("2:00 PM");
    expect(view.container.textContent).not.toContain("11:00 AM");
    expect(view.container.textContent).not.toContain("Review appointment");
    view.cleanup();
  });

  it("preserves the selection through customer sign-in and resumes confirmation", async () => {
    const confirmBooking = vi.fn().mockResolvedValue(confirmedBooking("booking-1", "customer-1"));
    const facade = fakeFacade({ confirmBooking });
    const view = await renderPage(facade);
    await completeSelection(view.container);

    await click(view.container, "Sign in to confirm");
    expect(auth.openAccountAuth).toHaveBeenCalledWith("login");
    expect(view.container.textContent).toContain("Structured manicure");
    expect(view.container.textContent).toContain("11:00 AM");

    auth.mode = "login";
    await view.rerender();
    auth.user = customer();
    auth.mode = null;
    await view.rerender();
    await waitFor(() => expect(confirmBooking).toHaveBeenCalledWith(expect.objectContaining({
      techProfileId: "tech-1",
      customerId: "customer-1",
      serviceId: "service-1",
      startAt: "2026-07-14T15:00:00.000Z",
      month: "2026-07"
    })));
    await view.rerender();
    expect(confirmBooking).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Appointment confirmed");
    view.cleanup();
  });

  it("clears a booking-owned auth intent when the modal is dismissed before a later header login", async () => {
    const confirmBooking = vi.fn();
    const view = await renderPage(fakeFacade({ confirmBooking }));
    await completeSelection(view.container);
    await click(view.container, "Sign in to confirm");

    auth.mode = "login";
    await view.rerender();
    auth.mode = null;
    await view.rerender();
    auth.user = customer();
    await view.rerender();

    expect(confirmBooking).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("Review appointment");
    view.cleanup();
  });

  it("rejects tech accounts from customer confirmation", async () => {
    auth.user = { ...customer(), role: "TECH" };
    const facade = fakeFacade();
    const view = await renderPage(facade);
    await completeSelection(view.container);
    await click(view.container, "Confirm appointment");

    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("customer account");
    expect(facade.confirmBooking).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("disables duplicate confirmation while the first request is pending", async () => {
    auth.user = customer();
    const confirmation = deferred<ReturnType<typeof confirmedBooking>>();
    const facade = fakeFacade({ confirmBooking: vi.fn().mockReturnValue(confirmation.promise) });
    const view = await renderPage(facade);
    await completeSelection(view.container);

    const confirm = button(view.container, "Confirm appointment");
    await act(async () => { confirm.click(); });
    expect(button(view.container, "Confirming…").disabled).toBe(true);
    button(view.container, "Confirming…").click();
    expect(facade.confirmBooking).toHaveBeenCalledTimes(1);
    confirmation.resolve(confirmedBooking("booking-1", "customer-1"));
    await flush();
    view.cleanup();
  });

  it("locks every selection control while confirming and cannot create a second booking", async () => {
    auth.user = customer();
    const confirmation = deferred<ReturnType<typeof confirmedBooking>>();
    const confirmBooking = vi.fn().mockReturnValue(confirmation.promise);
    const facade = fakeFacade({ confirmBooking });
    const view = await renderPage(facade);
    await completeSelection(view.container);
    await act(async () => button(view.container, "Confirm appointment").click());

    expect(Array.from(view.container.querySelectorAll<HTMLInputElement>("input[name='booking-service']")).every((control) => control.disabled)).toBe(true);
    expect(view.container.querySelector<HTMLButtonElement>("button[aria-label='Previous month']")?.disabled).toBe(true);
    expect(view.container.querySelector<HTMLButtonElement>("button[aria-label='Next month']")?.disabled).toBe(true);
    expect(view.container.querySelector<HTMLButtonElement>("[data-calendar-date='2026-07-14']")?.disabled).toBe(true);
    expect(button(view.container, "11:00 AM").disabled).toBe(true);
    await act(async () => {
      view.container.querySelector<HTMLInputElement>("input[value='service-2']")?.click();
      view.container.querySelector<HTMLButtonElement>("button[aria-label='Next month']")?.click();
      button(view.container, "Confirming…").click();
    });
    expect(confirmBooking).toHaveBeenCalledTimes(1);

    confirmation.resolve(confirmedBooking("booking-1", "customer-1"));
    await flush();
    expect(view.container.textContent).toContain("Appointment confirmed");
    view.cleanup();
  });

  it("starts an independent same-slot confirmation for a new customer and ignores the old owner's result", async () => {
    auth.user = customer("customer-a");
    const first = deferred<ReturnType<typeof confirmedBooking>>();
    const second = deferred<ReturnType<typeof confirmedBooking>>();
    const confirmBooking = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await renderPage(fakeFacade({ confirmBooking }));
    await completeSelection(view.container);
    await act(async () => button(view.container, "Confirm appointment").click());

    auth.user = customer("customer-b");
    await view.rerender();
    await click(view.container, "Confirm appointment");

    expect(confirmBooking).toHaveBeenNthCalledWith(1, expect.objectContaining({ customerId: "customer-a", techProfileId: "tech-1" }));
    expect(confirmBooking).toHaveBeenNthCalledWith(2, expect.objectContaining({ customerId: "customer-b", techProfileId: "tech-1" }));
    first.resolve(confirmedBooking("booking-a", "customer-a"));
    await flush();
    expect(view.container.textContent).not.toContain("Appointment confirmed");

    second.resolve(confirmedBooking("booking-b", "customer-b"));
    await flush();
    expect(view.container.textContent).toContain("Appointment confirmed");
    view.cleanup();
  });

  it("ignores an in-flight confirmation after the booking route changes", async () => {
    auth.user = customer();
    const first = deferred<ReturnType<typeof confirmedBooking>>();
    const loadBookingPage = vi.fn(async (techId: string) => {
      const nextProfile = { ...profile(), id: techId, businessName: techId === "tech-1" ? "The Nail Study" : "Second Studio" };
      return { profile: nextProfile, services: nextProfile.services as never };
    });
    const view = await renderPage(fakeFacade({ loadBookingPage, confirmBooking: vi.fn().mockReturnValue(first.promise) }));
    await completeSelection(view.container);
    await act(async () => button(view.container, "Confirm appointment").click());

    route.id = "tech-2";
    await view.rerender();
    first.resolve(confirmedBooking("booking-a", "customer-1"));
    await flush();

    expect(view.container.textContent).toContain("Book with Second Studio");
    expect(view.container.textContent).not.toContain("Appointment confirmed");
    expect(view.container.textContent).not.toContain("Review appointment");
    view.cleanup();
  });

  it("focuses a booking conflict, clears only the time, and applies the refreshed month", async () => {
    auth.user = customer();
    const refreshed = monthAvailability({ localTime: "11:30 AM", startAt: "2026-07-14T15:30:00.000Z" });
    const facade = fakeFacade({
      loadMonth: vi.fn().mockResolvedValueOnce(monthAvailability()).mockResolvedValueOnce(refreshed),
      confirmBooking: vi.fn().mockResolvedValue({ kind: "conflict", message: "That time was just booked. Choose another time." })
    });
    const view = await renderPage(facade);
    await completeSelection(view.container);
    await click(view.container, "Confirm appointment");

    const alert = view.container.querySelector<HTMLElement>("[role='alert']")!;
    expect(alert.textContent).toContain("just booked");
    expect(document.activeElement).toBe(alert);
    expect(view.container.querySelector("[data-calendar-date='2026-07-14']")?.closest("[role='gridcell']")?.getAttribute("aria-selected")).toBe("true");
    expect(view.container.textContent).toContain("11:30 AM");
    expect(view.container.textContent).not.toContain("Review appointment");
    view.cleanup();
  });

  it("announces and focuses a conflict even when the availability refresh fails", async () => {
    auth.user = customer();
    const refresh = deferred<MonthAvailability>();
    const facade = fakeFacade({
      loadMonth: vi.fn().mockResolvedValueOnce(monthAvailability()).mockReturnValueOnce(refresh.promise),
      confirmBooking: vi.fn().mockResolvedValue({ kind: "conflict", message: "That time was just booked. Choose another time." })
    });
    const view = await renderPage(facade);
    await completeSelection(view.container);
    await click(view.container, "Confirm appointment");

    const alert = view.container.querySelector<HTMLElement>("[role='alert']")!;
    expect(alert.textContent).toContain("just booked");
    expect(document.activeElement).toBe(alert);
    expect(view.container.textContent).not.toContain("Review appointment");
    expect(view.container.textContent).not.toContain("11:00 AM");

    refresh.reject(new Error("Availability refresh failed"));
    await flush();
    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("just booked");
    expect(view.container.textContent).not.toContain("11:00 AM");
    view.cleanup();
  });

  it("applies a safe month refresh after only the selected day changes", async () => {
    auth.user = customer();
    const initial = monthAvailability();
    initial.slots.push({ startAt: "2026-07-15T16:00:00.000Z", localDate: "2026-07-15", localTime: "12:00 PM", timeZone: "America/New_York" });
    const refreshed = deferred<MonthAvailability>();
    const facade = fakeFacade({
      loadMonth: vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(refreshed.promise),
      confirmBooking: vi.fn().mockResolvedValue({ kind: "conflict", message: "That time was just booked. Choose another time." })
    });
    const view = await renderPage(facade);
    await completeSelection(view.container);
    await click(view.container, "Confirm appointment");
    await selectDate(view.container, "2026-07-15");

    const nextMonth = monthAvailability({ localDate: "2026-07-15", localTime: "12:30 PM", startAt: "2026-07-15T16:30:00.000Z" });
    nextMonth.slots.push({ startAt: "2026-07-14T15:00:00.000Z", localDate: "2026-07-14", localTime: "11:00 AM", timeZone: "America/New_York" });
    refreshed.resolve(nextMonth);
    await flush();

    expect(view.container.textContent).toContain("12:30 PM");
    expect(view.container.textContent).not.toContain("11:00 AM");
    expect(view.container.querySelector("[data-calendar-date='2026-07-15']")?.closest("[role='gridcell']")?.getAttribute("aria-selected")).toBe("true");
    view.cleanup();
  });

  it("uses the technician timezone for the initial month instead of the visitor timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T02:00:00.000Z"));
    const facade = fakeFacade();
    const view = await renderPage(facade, { useDefaultMonth: true });
    await click(view.container, "Structured manicure");
    await waitFor(() => expect(facade.loadMonth).toHaveBeenCalled());

    expect(facade.loadMonth).toHaveBeenCalledWith("tech-1", "service-1", "2026-07");
    view.cleanup();
    vi.useRealTimers();
  });

  it("shows a useful load error", async () => {
    const facade = fakeFacade({ loadBookingPage: vi.fn().mockRejectedValue(new Error("Artist booking details could not be loaded")) });
    const view = await renderPage(facade);
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("could not be loaded"));
    expect(document.activeElement).toBe(view.container.querySelector("[role='alert']"));
    view.cleanup();
  });
});

function fakeFacade(overrides: Partial<BookingFacade> = {}): BookingFacade {
  return {
    loadBookingPage: vi.fn().mockResolvedValue({ profile: profile(), services: profile().services }),
    loadMonth: vi.fn().mockResolvedValue(monthAvailability()),
    confirmBooking: vi.fn().mockResolvedValue(confirmedBooking("booking-1", "customer-1")),
    ...overrides
  } as BookingFacade;
}

function profile(): PublicTechProfile {
  return {
    id: "tech-1",
    businessName: "The Nail Study",
    displayName: "Mia Chen",
    bio: null,
    phone: null,
    email: null,
    instagramUrl: null,
    bookingEnabled: true,
    bookingTimeZone: "America/New_York",
    specialties: ["Gel-X"],
    averageRating: 5,
    reviewCount: 4,
    publicLocationLabel: "Charlotte, NC",
    profileImage: null,
    backgroundImage: null,
    galleryImages: [],
    services: [
      { id: "service-1", name: "Structured manicure", description: "Detailed gel service", durationMinutes: 90, startingPriceCents: 9500 },
      { id: "service-2", name: "Gel removal", description: null, durationMinutes: 30, startingPriceCents: 2500 }
    ],
    reviews: []
  };
}

function monthAvailability(overrides: { serviceId?: string; localTime?: string; startAt?: string; localDate?: string } = {}): MonthAvailability {
  const serviceId = overrides.serviceId ?? "service-1";
  const localDate = overrides.localDate ?? "2026-07-14";
  const firstTime = overrides.localTime ?? "11:00 AM";
  const firstStart = overrides.startAt ?? "2026-07-14T15:00:00.000Z";
  return {
    month: "2026-07",
    timeZone: "America/New_York",
    cancellationCutoffMinutes: 1440,
    service: { id: serviceId, name: serviceId === "service-1" ? "Structured manicure" : "Gel removal", durationMinutes: serviceId === "service-1" ? 90 : 30, startingPriceCents: serviceId === "service-1" ? 9500 : 2500 },
    slots: [
      { startAt: firstStart, localDate, localTime: firstTime, timeZone: "America/New_York" },
      ...(serviceId === "service-1" && overrides.localTime === undefined ? [{ startAt: "2026-07-14T15:30:00.000Z", localDate: "2026-07-14", localTime: "11:30 AM", timeZone: "America/New_York" }] : [])
    ]
  };
}

function customer(id = "customer-1"): AuthUser {
  return { id, email: `${id}@example.com`, role: "CUSTOMER", fullName: "Ava Customer", avatarUrl: null };
}

function confirmedBooking(id: string, customerId: string) {
  return { kind: "confirmed" as const, booking: { id, customerId } };
}

async function renderPage(facade: BookingFacade, options: { useDefaultMonth?: boolean } = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, KeyboardEvent: window.KeyboardEvent });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = async () => { await act(async () => { root.render(<BookingPage facade={facade} initialMonth={options.useDefaultMonth ? undefined : "2026-07"} />); }); await flush(); };
  await render();
  return { container, rerender: render, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

async function chooseService(container: HTMLElement) {
  await click(container, "Structured manicure");
  await waitFor(() => expect(container.querySelector<HTMLButtonElement>("[data-calendar-date='2026-07-14']")?.disabled).toBe(false));
}

async function selectDate(container: HTMLElement, date: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(`[data-calendar-date='${date}']`)?.click());
}

async function completeSelection(container: HTMLElement) {
  await chooseService(container);
  await selectDate(container, "2026-07-14");
  await click(container, "11:00 AM");
  expect(container.textContent).toContain("Review appointment");
  expect(container.textContent).toContain("Cancel at least 1 day before the appointment.");
}

async function click(container: HTMLElement, text: string) {
  const radio = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='radio']")).find((candidate) => candidate.closest("label")?.textContent?.includes(text));
  await act(async () => (radio ?? button(container, text)).click());
  await flush();
}

function button(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim().startsWith(text));
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 19) throw error;
      await flush();
    }
  }
}
