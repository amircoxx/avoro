import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleFacade } from "@/facades/schedule.facade";
import { ApiClientError, type BookingDto, type TechCalendarBookingDto } from "@/services/api";

const initialWindow = new Window();
Object.assign(globalThis, {
  window: initialWindow,
  document: initialWindow.document,
  HTMLElement: initialWindow.HTMLElement,
  Event: initialWindow.Event,
  IS_REACT_ACT_ENVIRONMENT: true
});
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { assignBookingLanes, BookingsCalendar, getCalendarRange } = await import("../bookings-calendar");

describe("technician booking calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("creates offset-aware week and month bounds in the schedule timezone across DST", () => {
    expect(getCalendarRange("week", new Date("2026-03-08T16:00:00.000Z"), "America/New_York")).toMatchObject({
      from: "2026-03-08T00:00:00.000-05:00",
      to: "2026-03-15T00:00:00.000-04:00",
      label: "March 8–14, 2026"
    });
    expect(getCalendarRange("month", new Date("2026-11-15T17:00:00.000Z"), "America/New_York")).toMatchObject({
      from: "2026-11-01T00:00:00.000-04:00",
      to: "2026-12-01T00:00:00.000-05:00",
      label: "November 2026"
    });
  });

  it("places schedule-zone instants on their correct day with deterministic overlap lanes", () => {
    const bookings = [
      booking({ id: "later-id", startAt: "2026-08-05T14:30:00.000Z", endAt: "2026-08-05T16:00:00.000Z" }),
      booking({ id: "first-id", startAt: "2026-08-05T14:00:00.000Z", endAt: "2026-08-05T15:30:00.000Z" }),
      booking({ id: "free-id", startAt: "2026-08-05T17:00:00.000Z", endAt: "2026-08-05T18:00:00.000Z" })
    ];

    expect(assignBookingLanes(bookings, "America/New_York").map(({ booking: item, localDate, startMinute, durationMinutes, lane, laneCount }) => ({
      id: item.id, localDate, startMinute, durationMinutes, lane, laneCount
    }))).toEqual([
      { id: "first-id", localDate: "2026-08-05", startMinute: 600, durationMinutes: 90, lane: 0, laneCount: 2 },
      { id: "later-id", localDate: "2026-08-05", startMinute: 630, durationMinutes: 90, lane: 1, laneCount: 2 },
      { id: "free-id", localDate: "2026-08-05", startMinute: 780, durationMinutes: 60, lane: 0, laneCount: 1 }
    ]);
  });

  it("ships the week view, exact initial range, schedule-zone labels, proportional geometry, and a single accessible list", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([
      booking(),
      booking({ id: "canceled", status: "CANCELED", canCancel: false, canceledAt: "2026-08-01T12:00:00.000Z", startAt: "2026-08-06T15:00:00.000Z", endAt: "2026-08-06T16:00:00.000Z" })
    ]);
    const view = await renderCalendar({ facade });
    await flush();

    expect(facade.loadBookings).toHaveBeenCalledWith({
      from: "2026-08-02T00:00:00.000-04:00",
      to: "2026-08-09T00:00:00.000-04:00"
    });
    expect(view.container.querySelector('[aria-label="Calendar view"] [aria-pressed="true"]')?.textContent).toBe("Week");
    expect(view.container.querySelector(".schedule-week-time-grid")?.getAttribute("aria-hidden")).toBe("true");
    expect(view.container.querySelectorAll('[aria-label="Appointments by date"]')).toHaveLength(1);
    expect(view.container.querySelector(".schedule-bookings-list")?.getAttribute("aria-hidden")).toBeNull();
    const event = view.container.querySelector<HTMLElement>('.schedule-calendar-event[data-booking-id="booking-1"]');
    expect(event?.dataset.localDate).toBe("2026-08-05");
    expect(event?.style.getPropertyValue("--booking-offset")).toBe("180");
    expect(event?.style.getPropertyValue("--booking-duration")).toBe("90");
    expect(view.container.querySelector('.schedule-calendar-event[data-booking-id="canceled"]')?.classList.contains("is-canceled")).toBe(true);
    expect(view.container.textContent).toContain("Canceled");
    expect(view.container.textContent).not.toContain("avery@example.com");
    expect(view.container.textContent).not.toContain("Avery Customer");
    view.cleanup();
  });

  it("navigates previous, next, today, and month with fresh timezone-bounded requests", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([]);
    const view = await renderCalendar({ facade });
    await flush();

    await click(buttonNamed(view.container, "Next week"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-09T00:00:00.000-04:00", to: "2026-08-16T00:00:00.000-04:00" });
    await click(buttonNamed(view.container, "Previous week"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-02T00:00:00.000-04:00", to: "2026-08-09T00:00:00.000-04:00" });
    await click(buttonNamed(view.container, "Month"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-01T00:00:00.000-04:00", to: "2026-09-01T00:00:00.000-04:00" });
    expect(view.container.querySelector(".schedule-month-overview")).not.toBeNull();
    expect(view.container.querySelector(".schedule-week-time-grid")).toBeNull();
    await click(buttonNamed(view.container, "Previous month"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-07-01T00:00:00.000-04:00", to: "2026-08-01T00:00:00.000-04:00" });
    await click(buttonNamed(view.container, "Today"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-01T00:00:00.000-04:00", to: "2026-09-01T00:00:00.000-04:00" });
    view.cleanup();
  });

  it("forces one fresh current-week load when Today keeps the same bounds and ignores the superseded response", async () => {
    const first = deferred<TechCalendarBookingDto[]>();
    const refreshed = deferred<TechCalendarBookingDto[]>();
    const facade = facadeStub();
    facade.loadBookings.mockReturnValueOnce(first.promise).mockReturnValueOnce(refreshed.promise);
    const view = await renderCalendar({ facade });

    await click(buttonNamed(view.container, "Today"));
    expect(facade.loadBookings).toHaveBeenCalledTimes(2);
    refreshed.resolve([booking({ id: "refreshed", serviceName: "Fresh current week" })]);
    await flush();
    first.resolve([booking({ id: "stale-today", serviceName: "Stale current week" })]);
    await flush();

    expect(view.container.textContent).toContain("Fresh current week");
    expect(view.container.textContent).not.toContain("Stale current week");
    view.cleanup();
  });

  it("forces one fresh current-month load when Today keeps the same bounds", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([booking()]);
    const view = await renderCalendar({ facade });
    await flush();
    await click(buttonNamed(view.container, "Month"));
    expect(facade.loadBookings).toHaveBeenCalledTimes(2);

    await click(buttonNamed(view.container, "Today"));
    expect(facade.loadBookings).toHaveBeenCalledTimes(3);
    expect(view.container.textContent).toContain("Gel-X Full Set");
    view.cleanup();
  });

  it("keeps current appointments visible while a same-range Today refresh is pending", async () => {
    const refreshed = deferred<TechCalendarBookingDto[]>();
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValueOnce([booking({ serviceName: "Current appointment" })]).mockReturnValueOnce(refreshed.promise);
    const view = await renderCalendar({ facade });
    await flush();

    await click(buttonNamed(view.container, "Today"));
    expect(view.container.textContent).toContain("Current appointment");
    refreshed.resolve([booking({ serviceName: "Refreshed appointment" })]);
    await flush();
    expect(view.container.textContent).toContain("Refreshed appointment");
    view.cleanup();
  });

  it("ignores stale range and owner responses", async () => {
    const oldRange = deferred<TechCalendarBookingDto[]>();
    const nextRange = deferred<TechCalendarBookingDto[]>();
    const newOwner = deferred<TechCalendarBookingDto[]>();
    const facade = facadeStub();
    facade.loadBookings.mockReturnValueOnce(oldRange.promise).mockReturnValueOnce(nextRange.promise).mockReturnValueOnce(newOwner.promise);
    const view = await renderCalendar({ facade });

    await click(buttonNamed(view.container, "Next week"));
    nextRange.resolve([booking({ id: "next-range", serviceName: "Next range service", startAt: "2026-08-12T14:00:00.000Z", endAt: "2026-08-12T15:00:00.000Z" })]);
    await flush();
    oldRange.resolve([booking({ id: "stale-range", serviceName: "Stale range service" })]);
    await flush();
    expect(view.container.textContent).toContain("Next range service");
    expect(view.container.textContent).not.toContain("Stale range service");

    await view.rerender({ scopeKey: "tech-2", timeZone: "America/Los_Angeles" });
    newOwner.resolve([booking({ id: "new-owner", serviceName: "New owner service", currentTimeZone: "America/Los_Angeles" })]);
    await flush();
    expect(view.container.textContent).toContain("New owner service");
    expect(view.container.textContent).not.toContain("Next range service");
    view.cleanup();
  });

  it("selects from the semantic date list and shows owner-only snapshot details with dual timezone labels", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([booking({ timeZone: "America/Los_Angeles", currentTimeZone: "America/New_York" })]);
    const view = await renderCalendar({ facade });
    await flush();

    const selection = view.container.querySelector<HTMLButtonElement>('.schedule-bookings-list button[data-booking-id="booking-1"]');
    expect(selection?.getAttribute("aria-pressed")).toBe("false");
    await click(selection!);
    expect(selection?.getAttribute("aria-pressed")).toBe("true");
    const detail = view.container.querySelector('[aria-label="Booking details"]');
    expect(detail?.textContent).toContain("Avery Customer");
    expect(detail?.textContent).toContain("avery@example.com");
    expect(detail?.textContent).toContain("booking-1");
    expect(detail?.textContent).toContain("Confirmed");
    expect(detail?.textContent).toContain("$85.00");
    expect(detail?.textContent).toContain("90 minutes");
    expect(detail?.textContent).toContain("Schedule time");
    expect(detail?.textContent).toContain("America/New_York");
    expect(detail?.textContent).toContain("Booked time");
    expect(detail?.textContent).toContain("America/Los_Angeles");
    view.cleanup();
  });

  it("uses the month as an overview and selects a populated day logically", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([booking()]);
    const view = await renderCalendar({ facade });
    await flush();
    await click(buttonNamed(view.container, "Month"));
    await flush();

    const day = view.container.querySelector<HTMLButtonElement>('button[data-local-date="2026-08-05"]');
    expect(day?.getAttribute("aria-label")).toContain("1 booking");
    await click(day!);
    expect(day?.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.querySelector('[aria-label="Booking details"]')?.textContent).toContain("Gel-X Full Set");
    view.cleanup();
  });

  it("confirms once, retains detail, marks cancellation immediately, and reloads the current visible range", async () => {
    const facade = facadeStub();
    const cancellation = deferred<BookingDto>();
    const confirmed = booking();
    const canceled = booking({ status: "CANCELED", canCancel: false, canceledAt: "2026-08-03T12:00:00.000Z" });
    facade.loadBookings.mockResolvedValueOnce([confirmed]).mockResolvedValueOnce([canceled]);
    facade.cancelBooking.mockReturnValue(cancellation.promise);
    const view = await renderCalendar({ facade });
    await flush();
    await click(view.container.querySelector<HTMLButtonElement>('.schedule-bookings-list button[data-booking-id="booking-1"]')!);
    await click(buttonNamed(view.container, "Cancel appointment"));

    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    const confirm = buttonNamed(view.container, "Confirm cancellation");
    act(() => { confirm.click(); confirm.click(); });
    expect(facade.cancelBooking).toHaveBeenCalledOnce();
    expect(facade.cancelBooking).toHaveBeenCalledWith("booking-1");
    cancellation.resolve(canceled);
    await flush();
    await flush();

    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-02T00:00:00.000-04:00", to: "2026-08-09T00:00:00.000-04:00" });
    const detail = view.container.querySelector('[aria-label="Booking details"]');
    expect(detail?.textContent).toContain("Canceled");
    expect(detail?.textContent).not.toContain("Cancel appointment");
    expect(detail?.getAttribute("tabindex")).toBe("-1");
    expect(view.document.activeElement).toBe(detail);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.cleanup();
  });

  it("expires cancellation at the exact start while idle and rechecks live time before opening", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T13:59:59.000Z"));
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([booking({ startAt: "2026-08-05T14:00:00.000Z", endAt: "2026-08-05T15:30:00.000Z" })]);
    const view = await renderCalendar({ facade, now: new Date("2026-08-05T13:59:59.000Z") });
    await flush();
    await click(view.container.querySelector<HTMLButtonElement>('.schedule-bookings-list button[data-booking-id="booking-1"]')!);
    const cancel = buttonNamed(view.container, "Cancel appointment");

    vi.setSystemTime(new Date("2026-08-05T14:00:00.000Z"));
    await click(cancel);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => vi.runOnlyPendingTimers());
    expect(view.container.textContent).not.toContain("Cancel appointment");
    view.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains detail and focuses a stable cancellation error on failure", async () => {
    const facade = facadeStub();
    facade.loadBookings.mockResolvedValue([booking()]);
    facade.cancelBooking.mockRejectedValue(new ApiClientError({
      status: 409,
      code: "booking_already_started",
      message: "raw database detail"
    }));
    const view = await renderCalendar({ facade });
    await flush();
    await click(view.container.querySelector<HTMLButtonElement>('.schedule-bookings-list button[data-booking-id="booking-1"]')!);
    await click(buttonNamed(view.container, "Cancel appointment"));
    await click(buttonNamed(view.container, "Confirm cancellation"));
    await flush();

    const alert = view.container.querySelector<HTMLElement>('[role="dialog"] [role="alert"]');
    expect(view.container.querySelector('[aria-label="Booking details"]')?.textContent).toContain("Avery Customer");
    expect(alert?.textContent).toBe("This appointment has already started and cannot be canceled.");
    expect(alert?.textContent).not.toContain("database");
    expect(view.document.activeElement).toBe(alert);
    view.cleanup();
  });
});

type FacadeStub = ScheduleFacade & {
  loadBookings: ReturnType<typeof vi.fn>;
  cancelBooking: ReturnType<typeof vi.fn>;
};

function facadeStub(): FacadeStub {
  return { loadBookings: vi.fn(), cancelBooking: vi.fn() } as unknown as FacadeStub;
}

function booking(overrides: Partial<TechCalendarBookingDto> = {}): TechCalendarBookingDto {
  return {
    version: 0,
    id: "booking-1",
    techProfileId: "tech-profile-1",
    customerId: "customer-1",
    serviceId: "service-1",
    requestKey: "request-1",
    serviceName: "Gel-X Full Set",
    durationMinutes: 90,
    startingPriceCents: 8500,
    timeZone: "America/New_York",
    currentTimeZone: "America/New_York",
    cancellationCutoffMinutes: 120,
    startAt: "2026-08-05T14:00:00.000Z",
    endAt: "2026-08-05T15:30:00.000Z",
    blockedUntilAt: "2026-08-05T15:45:00.000Z",
    status: "CONFIRMED",
    canceledAt: null,
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
    tech: { id: "tech-profile-1", businessName: "Gloss Room", displayName: "Mia" },
    customer: { id: "customer-1", displayName: "Avery Customer", email: "avery@example.com" },
    canCancel: true,
    ...overrides
  };
}

async function renderCalendar({
  facade = facadeStub(),
  scopeKey = "tech-1",
  timeZone = "America/New_York",
  now = new Date("2026-08-05T12:00:00.000Z")
}: {
  facade?: FacadeStub;
  scopeKey?: string;
  timeZone?: string;
  now?: Date;
} = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const document = window.document as unknown as Document;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = (nextScopeKey: string, nextTimeZone: string) => root.render(
    <BookingsCalendar scopeKey={nextScopeKey} timeZone={nextTimeZone} facade={facade} now={now} />
  );
  await act(async () => render(scopeKey, timeZone));
  return {
    container,
    document,
    rerender: ({ scopeKey: nextScopeKey, timeZone: nextTimeZone }: { scopeKey: string; timeZone: string }) => act(async () => render(nextScopeKey, nextTimeZone)),
    cleanup: () => { act(() => root.unmount()); window.close(); }
  };
}

function buttonNamed(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name);
  if (!button) throw new Error(`Button ${name} was not rendered`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
  await flush();
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
