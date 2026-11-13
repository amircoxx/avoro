// @vitest-environment happy-dom
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ApiClientError, type BookingDto } from "@/services/api";
import { RescheduleDialog } from "../reschedule-dialog";

const booking: BookingDto = {
  id: "booking-1", techProfileId: "tech-1", customerId: "customer-1", serviceId: "service-1", requestKey: "creation-key",
  version: 0, serviceName: "Manicure", durationMinutes: 60, startingPriceCents: 5000, timeZone: "America/New_York",
  cancellationCutoffMinutes: 60, startAt: "2026-11-02T14:00:00.000Z", endAt: "2026-11-02T15:00:00.000Z",
  blockedUntilAt: "2026-11-02T15:00:00.000Z", status: "CONFIRMED", canceledAt: null, createdAt: "", updatedAt: "",
  tech: { id: "tech-1", businessName: "Studio", displayName: "Tech" }, customer: { id: "customer-1", displayName: "Customer" }, canCancel: true
};
const slot = { startAt: "2026-11-03T15:00:00.000Z", localDate: "2026-11-03", localTime: "10:00 AM", timeZone: "America/New_York" };
const available = { bookingId: booking.id, version: 2, month: "2026-11", timeZone: booking.timeZone,
  service: { id: "service-1", name: "Manicure", durationMinutes: 60, startingPriceCents: 5000 }, cancellationCutoffMinutes: 60, slots: [slot] };
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });

async function setup(overrides = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const api = { getRescheduleAvailability: vi.fn().mockResolvedValue(available), rescheduleBooking: vi.fn().mockResolvedValue({ ...booking, version: 3, startAt: slot.startAt }), ...overrides };
  const onSaved = vi.fn(); const onClose = vi.fn(); const onConflict = vi.fn();
  await act(async () => root.render(<RescheduleDialog booking={booking} api={api} onSaved={onSaved} onClose={onClose} onConflict={onConflict} />));
  const cleanup = () => { act(() => root.unmount()); window.close(); };
  cleanups.push(cleanup);
  return { api, onSaved, onClose, onConflict, unmount: () => { act(() => root.unmount()); cleanups.splice(cleanups.indexOf(cleanup), 1); window.close(); } };
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(text) || b.getAttribute("aria-label") === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function select() {
  await act(async () => document.querySelector<HTMLButtonElement>('[data-calendar-date="2026-11-03"]')!.click());
  await click("10:00 AM");
}
async function submit() {
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("loads booking-specific slots and sends the selected version, time and trimmed reason", async () => {
  const { api, onSaved } = await setup();
  expect(api.getRescheduleAvailability).toHaveBeenCalledWith(booking.id, "2026-11");
  expect(button("Confirm new time").disabled).toBe(true);
  await select();
  await act(async () => {
    const field = document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, "  New plans  ");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
  expect(api.rescheduleBooking).toHaveBeenCalledWith(booking.id, expect.objectContaining({ startAt: slot.startAt, version: 2, reason: "New plans", requestKey: expect.any(String) }));
  expect(api.rescheduleBooking.mock.calls[0][1].requestKey).not.toBe(booking.requestKey);
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
});

it("reuses the request key after an ambiguous failure and prevents duplicate pending submissions", async () => {
  let resolve!: (value: BookingDto) => void;
  const pending = new Promise<BookingDto>(done => { resolve = done; });
  const save = vi.fn().mockRejectedValueOnce(new Error("Network interrupted")).mockReturnValueOnce(pending);
  const { onSaved } = await setup({ rescheduleBooking: save });
  await select(); await submit();
  expect(document.body.textContent).toContain("couldn’t confirm");
  await submit(); await submit();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][1]).toEqual(save.mock.calls[0][1]);
  expect(button("Close rescheduling").disabled).toBe(true);
  await act(async () => resolve({ ...booking, version: 3 }));
  expect(onSaved).toHaveBeenCalledOnce();
});

it("refreshes and clears selection after a version conflict, requiring a new confirmation", async () => {
  const load = vi.fn().mockResolvedValueOnce(available).mockResolvedValue({ ...available, version: 3 });
  const save = vi.fn().mockRejectedValueOnce(new ApiClientError({ status: 409, code: "booking_version_conflict", message: "Changed" })).mockResolvedValue({ ...booking, version: 4 });
  const { onConflict } = await setup({ getRescheduleAvailability: load, rescheduleBooking: save });
  await select(); await submit();
  expect(onConflict).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledTimes(2);
  expect(button("Confirm new time").disabled).toBe(true);
  expect(document.body.textContent).toContain("choose a time again");
  await select(); await submit();
  expect(save.mock.calls[1][1].version).toBe(3);
  expect(save.mock.calls[1][1].requestKey).not.toBe(save.mock.calls[0][1].requestKey);
});

it("provides an empty state and a retry after loading fails", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue({ ...available, slots: [] });
  await setup({ getRescheduleAvailability: load });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Unavailable");
  await click("Reload available times");
  expect(document.body.textContent).toContain("No alternative times");
  expect(button("Confirm new time").disabled).toBe(true);
});

it("does not apply a completed save after the dialog unmounts", async () => {
  let resolve!: (value: BookingDto) => void;
  const save = vi.fn(() => new Promise<BookingDto>(done => { resolve = done; }));
  const { onSaved, unmount } = await setup({ rescheduleBooking: save });
  await select(); await submit(); unmount();
  await act(async () => resolve(booking));
  expect(onSaved).not.toHaveBeenCalled();
});


it("ignores an old month's response after navigating forward", async () => {
  let finishOld!: (value: typeof available) => void;
  const old = new Promise<typeof available>(resolve => { finishOld = resolve; });
  const load = vi.fn().mockReturnValueOnce(old).mockResolvedValue({ ...available, month: "2026-12", slots: [] });
  await setup({ getRescheduleAvailability: load });
  await click("Next month");
  await act(async () => finishOld(available));
  expect(document.body.textContent).toContain("December 2026");
  expect(document.body.textContent).toContain("No alternative times");
  expect(button("Confirm new time").disabled).toBe(true);
});

it("uses a new key when the intended time changes after a network failure", async () => {
  const other = { ...slot, startAt: "2026-11-03T16:00:00.000Z", localTime: "11:00 AM" };
  const save = vi.fn().mockRejectedValue(new Error("Network failed"));
  await setup({ getRescheduleAvailability: vi.fn().mockResolvedValue({ ...available, slots: [slot, other] }), rescheduleBooking: save });
  await select(); await submit(); await click("11:00 AM"); await submit();
  expect(save.mock.calls[1][1].requestKey).not.toBe(save.mock.calls[0][1].requestKey);
  expect(save.mock.calls[1][1].startAt).toBe(other.startAt);
});
