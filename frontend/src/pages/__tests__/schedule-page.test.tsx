import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, ScheduleSettings, TechCalendarBookingDto } from "@/services/api";

const auth = vi.hoisted(() => ({ user: null as AuthUser | null, isAuthLoading: false }));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/context/account-auth-context", () => ({
  useAccountAuth: () => ({ authUser: auth.user, isAuthLoading: auth.isAuthLoading })
}));
vi.mock("@/hooks/router", () => ({ useRouter: () => ({ push }) }));

import SchedulePage from "../schedule-page";
import type { ScheduleFacade } from "@/facades/schedule.facade";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("SchedulePage", () => {
  beforeEach(() => {
    auth.user = tech("tech-1");
    auth.isAuthLoading = false;
    push.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("ships Bookings as the default non-broken tab while retaining Availability and Services", async () => {
    const facade = createFacade();
    const view = await renderPage(facade);
    await flush();

    expect(view.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Bookings");
    expect(view.container.textContent).toContain("Booking register");
    expect(view.container.querySelector('[aria-label="Calendar view"]')?.textContent).toContain("Week");
    expect(view.container.textContent).not.toContain("calendar workspace is being prepared");
    expect(view.container.textContent).toContain("Availability");
    expect(view.container.textContent).toContain("Services");
    expect(facade.loadScheduleWorkspace).toHaveBeenCalledOnce();
    expect(facade.loadBookings).toHaveBeenCalledOnce();
    view.cleanup();
  });

  it("never loads technician data for a customer", async () => {
    auth.user = { ...tech("customer-1"), role: "CUSTOMER" };
    const facade = createFacade();
    const view = await renderPage(facade);
    await flush();

    expect(push).toHaveBeenCalledWith("/");
    expect(facade.loadScheduleWorkspace).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("ignores a stale workspace response after the active technician changes", async () => {
    const first = deferred<Awaited<ReturnType<ScheduleFacade["loadScheduleWorkspace"]>>>();
    const second = deferred<Awaited<ReturnType<ScheduleFacade["loadScheduleWorkspace"]>>>();
    const facade = createFacade();
    facade.loadScheduleWorkspace.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await renderPage(facade);

    auth.user = tech("tech-2");
    await view.rerender(facade);
    second.resolve(workspace("America/Chicago"));
    await flush();
    first.resolve(workspace("America/New_York"));
    await flush();

    const availabilityTab = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.includes("Availability"));
    await act(async () => availabilityTab?.click());
    expect(view.container.querySelector<HTMLSelectElement>('select')?.value).toBe("America/Chicago");
    view.cleanup();
  });

  it("keeps an availability draft when the tech checks another tab", async () => {
    const facade = createFacade();
    const view = await renderPage(facade);
    await flush();
    const tabs = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    await act(async () => tabs.find((button) => button.textContent?.includes("Availability"))?.click());
    const timeZone = view.container.querySelector<HTMLSelectElement>('.schedule-policies select');
    if (!timeZone) throw new Error("Timezone control did not render");
    await act(async () => {
      timeZone.value = "America/Chicago";
      timeZone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => tabs.find((button) => button.textContent?.includes("Services"))?.click());
    await act(async () => tabs.find((button) => button.textContent?.includes("Availability"))?.click());

    expect(view.container.querySelector<HTMLSelectElement>('.schedule-policies select')?.value).toBe("America/Chicago");
    view.cleanup();
  });

  it("opens the calendar with the first server-canonical timezone immediately after a policy save", async () => {
    const facade = createFacade(null);
    const canonical = settings("America/Chicago");
    const warning = { bookingId: "booking-warning", startAt: "2026-08-06T15:00:00.000Z", message: "Existing booking falls outside the updated availability" as const };
    facade.saveSettings.mockResolvedValue({ settings: canonical, warnings: [warning] });
    const view = await renderPage(facade);
    await flush();
    expect(view.container.textContent).toContain("Set your business timezone");
    expect(facade.loadBookings).not.toHaveBeenCalled();

    await click(tabNamed(view.container, "Availability"));
    await click(Array.from(view.container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "+ Add period")!);
    expect(view.container.textContent).toContain("Unsaved weekly changes");
    await select(view.container.querySelector<HTMLSelectElement>(".schedule-policies select"), "America/Denver");
    await submit(view.container.querySelector(".schedule-policies"));
    expect(view.container.textContent).toContain(warning.message);
    expect(view.container.querySelector<HTMLSelectElement>(".schedule-policies select")?.value).toBe("America/Chicago");
    expect(view.container.textContent).toContain("Unsaved weekly changes");
    expect(view.container.textContent).toContain("1 period");

    await click(tabNamed(view.container, "Bookings"));
    await flush();
    expect(view.container.textContent).toContain("America/Chicago");
    expect(facade.loadBookings).toHaveBeenCalledWith({ from: "2026-08-02T00:00:00.000-05:00", to: "2026-08-09T00:00:00.000-05:00" });
    view.cleanup();
  });

  it("reloads a changed canonical timezone, ignores the old response, and uses current/snapshot labels", async () => {
    const oldTimeZone = deferred<TechCalendarBookingDto[]>();
    const newTimeZone = deferred<TechCalendarBookingDto[]>();
    const facade = createFacade("America/New_York");
    facade.loadBookings.mockReturnValueOnce(oldTimeZone.promise).mockReturnValueOnce(newTimeZone.promise);
    facade.saveSettings.mockResolvedValue({ settings: settings("America/Los_Angeles"), warnings: [] });
    const view = await renderPage(facade);

    await click(tabNamed(view.container, "Availability"));
    await select(view.container.querySelector<HTMLSelectElement>(".schedule-policies select"), "America/Los_Angeles");
    await submit(view.container.querySelector(".schedule-policies"));
    expect(facade.loadBookings).toHaveBeenLastCalledWith({ from: "2026-08-02T00:00:00.000-07:00", to: "2026-08-09T00:00:00.000-07:00" });

    newTimeZone.resolve([calendarBooking({ serviceName: "Canonical timezone booking", timeZone: "America/New_York", currentTimeZone: "America/Los_Angeles" })]);
    await flush();
    oldTimeZone.resolve([calendarBooking({ id: "stale-timezone", serviceName: "Stale timezone booking" })]);
    await flush();
    await click(tabNamed(view.container, "Bookings"));
    await click(view.container.querySelector<HTMLButtonElement>('.schedule-bookings-list button[data-booking-id="booking-1"]')!);

    expect(view.container.textContent).toContain("Canonical timezone booking");
    expect(view.container.textContent).not.toContain("Stale timezone booking");
    const detail = view.container.querySelector('[aria-label="Booking details"]');
    expect(detail?.textContent).toContain("Schedule time");
    expect(detail?.textContent).toContain("America/Los_Angeles");
    expect(detail?.textContent).toContain("Booked time");
    expect(detail?.textContent).toContain("America/New_York");
    view.cleanup();
  });
});

function createFacade(timeZone: string | null = "America/New_York") {
  return {
    loadScheduleWorkspace: vi.fn().mockResolvedValue(workspace(timeZone)),
    loadBookings: vi.fn().mockResolvedValue([]), cancelBooking: vi.fn(),
    saveSettings: vi.fn(), saveWeeklyAvailability: vi.fn(), saveOverride: vi.fn(), deleteOverride: vi.fn(),
    createService: vi.fn(), updateService: vi.fn()
  } as unknown as ScheduleFacade & Record<"loadScheduleWorkspace" | "loadBookings" | "saveSettings", ReturnType<typeof vi.fn>>;
}

function workspace(timeZone: string | null) {
  return {
    schedule: {
      settings: timeZone ? settings(timeZone) : null,
      weeklyAvailability: [], overrides: []
    },
    services: []
  };
}

function settings(timeZone: string): ScheduleSettings {
  return { timeZone, minimumNoticeMinutes: 120, maximumAdvanceDays: 60, bufferMinutes: 15, cancellationCutoffMinutes: 1440 };
}

function calendarBooking(overrides: Partial<TechCalendarBookingDto> = {}): TechCalendarBookingDto {
  return {
    version: 0,
    id: "booking-1", techProfileId: "tech-profile-1", customerId: "customer-1", serviceId: "service-1", requestKey: "request-1",
    serviceName: "Gel-X", durationMinutes: 60, startingPriceCents: 6500, timeZone: "America/New_York", cancellationCutoffMinutes: 120,
    startAt: "2026-08-05T14:00:00.000Z", endAt: "2026-08-05T15:00:00.000Z", blockedUntilAt: "2026-08-05T15:15:00.000Z",
    status: "CONFIRMED", canceledAt: null, createdAt: "2026-07-20T12:00:00.000Z", updatedAt: "2026-07-20T12:00:00.000Z",
    tech: { id: "tech-profile-1", businessName: "Gloss Room", displayName: "Mia" },
    customer: { id: "customer-1", displayName: "Avery", email: "avery@example.com" }, canCancel: true, ...overrides
  };
}

function tech(id: string): AuthUser {
  return { id, email: `${id}@example.com`, role: "TECH", fullName: id, avatarUrl: null };
}

async function renderPage(facade: ScheduleFacade) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = () => root.render(<SchedulePage facade={facade} calendarNow={new Date("2026-08-05T12:00:00.000Z")} />);
  await act(async () => render());
  return { container, rerender: async (_facade: ScheduleFacade) => act(async () => render()), cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function tabNamed(container: HTMLElement, name: string) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((candidate) => candidate.textContent?.includes(name));
  if (!tab) throw new Error(`Tab ${name} was not rendered`);
  return tab;
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
  await flush();
}

async function select(control: HTMLSelectElement | null, value: string) {
  if (!control) throw new Error("Expected select");
  await act(async () => {
    Object.getOwnPropertyDescriptor(control.ownerDocument.defaultView?.HTMLSelectElement.prototype ?? {}, "value")?.set?.call(control, value);
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit(form: Element | null) {
  if (!form) throw new Error("Expected form");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
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
