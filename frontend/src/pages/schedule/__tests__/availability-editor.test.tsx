import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ScheduleFacade } from "@/facades/schedule.facade";
import type { Schedule, ScheduleSettings, ScheduleWarning } from "@/services/api";

const initialWindow = new Window();
Object.assign(globalThis, { window: initialWindow, document: initialWindow.document, HTMLElement: initialWindow.HTMLElement, Event: initialWindow.Event, IS_REACT_ACT_ENVIRONMENT: true });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const {
  AvailabilityEditor,
  DEFAULT_SCHEDULE_SETTINGS,
  normalizeWeeklyAvailability,
  validateAvailabilityWindow
} = await import("../availability-editor");
const { validateOverride } = await import("../override-editor");

describe("availability editor rules", () => {
  it("suggests explicit setup defaults without implying published hours", () => {
    expect(DEFAULT_SCHEDULE_SETTINGS).toEqual({
      timeZone: "America/New_York",
      minimumNoticeMinutes: 120,
      maximumAdvanceDays: 60,
      bufferMinutes: 15,
      cancellationCutoffMinutes: 1440
    });
  });

  it("requires integer half-hour boundaries within a local day", () => {
    expect(validateAvailabilityWindow({ startMinute: 540, endMinute: 1020 })).toBeNull();
    expect(validateAvailabilityWindow({ startMinute: 541, endMinute: 1020 })).toMatch(/30-minute/);
    expect(validateAvailabilityWindow({ startMinute: 540, endMinute: 541 })).toMatch(/30-minute/);
    expect(validateAvailabilityWindow({ startMinute: 600, endMinute: 600 })).toMatch(/after/);
    expect(validateAvailabilityWindow({ startMinute: -30, endMinute: 60 })).toMatch(/local day/);
    expect(validateAvailabilityWindow({ startMinute: 0, endMinute: 1470 })).toMatch(/local day/);
  });

  it("sorts multiple periods by weekday/start and rejects overlaps before save", () => {
    expect(normalizeWeeklyAvailability([
      { weekday: 2, windows: [{ startMinute: 780, endMinute: 1020 }, { startMinute: 540, endMinute: 720 }] },
      { weekday: 1, windows: [{ startMinute: 600, endMinute: 720 }] }
    ])).toEqual({
      value: [
        { weekday: 1, windows: [{ startMinute: 600, endMinute: 720 }] },
        { weekday: 2, windows: [{ startMinute: 540, endMinute: 720 }, { startMinute: 780, endMinute: 1020 }] }
      ],
      error: null
    });

    expect(normalizeWeeklyAvailability([
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 720 }, { startMinute: 690, endMinute: 780 }] }
    ])).toMatchObject({ value: null, error: expect.stringMatching(/overlap/i) });
  });

  it("supports full-day closure and validated custom-hour overrides", () => {
    expect(validateOverride({ kind: "unavailable" })).toEqual({ value: { kind: "unavailable" }, error: null });
    expect(validateOverride({ kind: "custom", windows: [{ startMinute: 600, endMinute: 720 }] })).toEqual({
      value: { kind: "custom", windows: [{ startMinute: 600, endMinute: 720 }] }, error: null
    });
    expect(validateOverride({ kind: "custom", windows: [] })).toMatchObject({ value: null, error: expect.stringMatching(/period/i) });
  });

  it("renders a server-canonical midnight end as an explicit 24:00 choice", async () => {
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const facade = {
      saveSettings: vi.fn(), saveWeeklyAvailability: vi.fn(), saveOverride: vi.fn(), deleteOverride: vi.fn()
    } as unknown as ScheduleFacade;
    await act(async () => root.render(<AvailabilityEditor scopeKey="tech-1" schedule={{ settings: DEFAULT_SCHEDULE_SETTINGS, weeklyAvailability: [{ weekday: 1, startMinute: 540, endMinute: 1440 }], overrides: [] }} facade={facade} />));

    const monday = Array.from(container.querySelectorAll(".schedule-day")).find((day) => day.textContent?.includes("Monday"));
    const endControl = Array.from(monday?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? []).find((control) => control.closest("label")?.textContent?.includes("End"));
    expect(endControl?.value).toBe("1440");

    act(() => root.unmount());
    window.close();
  });

  it("preserves a valid stored IANA timezone outside the suggested US list", async () => {
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const facade = { saveSettings: vi.fn(), saveWeeklyAvailability: vi.fn(), saveOverride: vi.fn(), deleteOverride: vi.fn() } as unknown as ScheduleFacade;
    await act(async () => root.render(<AvailabilityEditor scopeKey="tech-1" schedule={{ settings: { ...DEFAULT_SCHEDULE_SETTINGS, timeZone: "Europe/London" }, weeklyAvailability: [], overrides: [] }} facade={facade} />));

    expect(container.querySelector<HTMLSelectElement>('.schedule-policies select')?.value).toBe("Europe/London");
    act(() => root.unmount());
    window.close();
  });

  it("offers runtime-supported IANA zones beyond the suggested US shortcuts", async () => {
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const facade = { saveSettings: vi.fn(), saveWeeklyAvailability: vi.fn(), saveOverride: vi.fn(), deleteOverride: vi.fn() } as unknown as ScheduleFacade;
    await act(async () => root.render(<AvailabilityEditor scopeKey="tech-1" schedule={{ settings: DEFAULT_SCHEDULE_SETTINGS, weeklyAvailability: [], overrides: [] }} facade={facade} />));

    const options = Array.from(container.querySelectorAll<HTMLSelectElement>('.schedule-policies select option')).map((option) => option.value);
    expect(options).toContain("Europe/London");
    act(() => root.unmount());
    window.close();
  });

  it("saves policies, applies server-canonical settings, and renders warnings as success notes", async () => {
    const facade = facadeStub();
    facade.saveSettings.mockResolvedValue({
      settings: { ...DEFAULT_SCHEDULE_SETTINGS, timeZone: "America/Denver", bufferMinutes: 30 },
      warnings: [warning]
    });
    const view = await renderAvailability({ facade });
    await select(view.container.querySelector<HTMLSelectElement>('.schedule-policies select'), "America/Chicago");
    await submit(view.container.querySelector('.schedule-policies'));

    expect(facade.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SCHEDULE_SETTINGS, timeZone: "America/Chicago" });
    expect(view.container.querySelector<HTMLSelectElement>('.schedule-policies select')?.value).toBe("America/Denver");
    expect(view.container.textContent).toContain("Existing appointments need review");
    expect(view.container.textContent).toContain(warning.message);
    expect(view.container.textContent).toContain("Current schedule: August 5, 2026 at 8:00 AM MDT (America/Denver)");
    expect(view.container.textContent).toContain("Booking snapshot: August 5, 2026 at 10:00 AM EDT (America/New_York)");
    expect(view.container.querySelector('.schedule-warnings')?.getAttribute("aria-live")).toBe("polite");
    expect(view.container.querySelector('.schedule-warnings [role="alert"]')).toBeNull();
    view.cleanup();
  });

  it("retains failed policy edits and focuses the error", async () => {
    const facade = facadeStub();
    facade.saveSettings.mockRejectedValue(new Error("Policy save unavailable"));
    const view = await renderAvailability({ facade });
    await select(view.container.querySelector<HTMLSelectElement>('.schedule-policies select'), "America/Chicago");
    await submit(view.container.querySelector('.schedule-policies'));

    const alert = view.container.querySelector<HTMLElement>('.schedule-policies [role="alert"]');
    expect(view.container.querySelector<HTMLSelectElement>('.schedule-policies select')?.value).toBe("America/Chicago");
    expect(alert?.textContent).toContain("Policy save unavailable");
    expect(view.document.activeElement).toBe(alert);
    view.cleanup();
  });

  it("saves multiple weekly periods in sorted day order and applies canonical hours", async () => {
    const facade = facadeStub();
    facade.saveWeeklyAvailability.mockResolvedValue({
      weeklyAvailability: [
        { weekday: 1, startMinute: 600, endMinute: 720 },
        { weekday: 1, startMinute: 780, endMinute: 900 }
      ],
      warnings: []
    });
    const view = await renderAvailability({ facade });
    const monday = dayNamed(view.container, "Monday");
    await click(buttonIn(monday, "+ Add period"));
    await click(buttonIn(monday, "+ Add period"));
    await selectPeriod(monday, 0, "780", "900");
    await selectPeriod(monday, 1, "600", "720");
    await submit(view.container.querySelector('.schedule-week')?.closest("form") ?? null);

    expect(facade.saveWeeklyAvailability).toHaveBeenCalledWith([
      { weekday: 1, windows: [{ startMinute: 600, endMinute: 720 }, { startMinute: 780, endMinute: 900 }] }
    ]);
    expect(Array.from(dayNamed(view.container, "Monday").querySelectorAll<HTMLSelectElement>("select")).map((control) => control.value)).toEqual(["600", "720", "780", "900"]);
    view.cleanup();
  });

  it("rejects overlapping weekly periods before save and focuses the alert", async () => {
    const facade = facadeStub();
    const view = await renderAvailability({ facade });
    const monday = dayNamed(view.container, "Monday");
    await click(buttonIn(monday, "+ Add period"));
    await click(buttonIn(monday, "+ Add period"));
    await submit(view.container.querySelector('.schedule-week')?.closest("form") ?? null);

    const alert = view.container.querySelector<HTMLElement>('.schedule-week + [role="alert"]');
    expect(facade.saveWeeklyAvailability).not.toHaveBeenCalled();
    expect(alert?.textContent).toContain("cannot overlap");
    expect(view.document.activeElement).toBe(alert);
    view.cleanup();
  });

  it("retains an override draft after failure", async () => {
    const facade = facadeStub();
    facade.saveOverride.mockRejectedValue(new Error("Override save unavailable"));
    const view = await renderAvailability({ facade });
    await setValue(inputNamed(view.container, "Date"), "2026-08-04");
    await click(radioNamed(view.container, "Custom hours"));
    await submit(view.container.querySelector('.schedule-override-form'));

    const alert = view.container.querySelector<HTMLElement>('.schedule-override-form [role="alert"]');
    expect(inputNamed(view.container, "Date")?.value).toBe("2026-08-04");
    expect(radioNamed(view.container, "Custom hours").checked).toBe(true);
    expect(alert?.textContent).toContain("Override save unavailable");
    expect(view.document.activeElement).toBe(alert);
    view.cleanup();
  });

  it("saves a full-day override, shows warnings, and clears that exact date", async () => {
    const facade = facadeStub();
    facade.saveOverride.mockResolvedValue({ localDate: "2026-08-05", kind: "unavailable", windows: [], warnings: [warning] });
    facade.deleteOverride.mockResolvedValue({ localDate: "2026-08-05", warnings: [] });
    const view = await renderAvailability({ facade });
    await setValue(inputNamed(view.container, "Date"), "2026-08-05");
    await submit(view.container.querySelector('.schedule-override-form'));

    expect(facade.saveOverride).toHaveBeenCalledWith("2026-08-05", { kind: "unavailable" });
    expect(view.container.textContent).toContain("2026-08-05");
    expect(view.container.textContent).toContain(warning.message);
    const clear = view.container.querySelector<HTMLButtonElement>('button[aria-label="Clear override 2026-08-05"]');
    expect(clear).not.toBeNull();
    await click(clear!);
    expect(facade.deleteOverride).toHaveBeenCalledWith("2026-08-05");
    expect(view.container.querySelector('button[aria-label="Clear override 2026-08-05"]')).toBeNull();
    view.cleanup();
  });

  it("ignores a late policy response from the previous owner", async () => {
    const pending = deferred<{ settings: ScheduleSettings; warnings: ScheduleWarning[] }>();
    const facade = facadeStub();
    facade.saveSettings.mockReturnValueOnce(pending.promise);
    const view = await renderAvailability({ facade, scopeKey: "tech-1" });
    await select(view.container.querySelector<HTMLSelectElement>('.schedule-policies select'), "America/Chicago");
    submitWithoutWaiting(view.container.querySelector('.schedule-policies'));

    await view.rerender({ scopeKey: "tech-2", schedule: schedule({ settings: { ...DEFAULT_SCHEDULE_SETTINGS, timeZone: "America/Los_Angeles" } }) });
    pending.resolve({ settings: { ...DEFAULT_SCHEDULE_SETTINGS, timeZone: "America/Denver" }, warnings: [warning] });
    await flush();

    expect(view.container.querySelector<HTMLSelectElement>('.schedule-policies select')?.value).toBe("America/Los_Angeles");
    expect(view.container.textContent).not.toContain(warning.message);
    view.cleanup();
  });
});

const warning = {
  bookingId: "booking-1",
  startAt: "2026-08-05T14:00:00.000Z",
  timeZoneSnapshot: "America/New_York",
  message: "Existing booking falls outside the updated availability" as const
};

type FacadeStub = ScheduleFacade & {
  saveSettings: ReturnType<typeof vi.fn>;
  saveWeeklyAvailability: ReturnType<typeof vi.fn>;
  saveOverride: ReturnType<typeof vi.fn>;
  deleteOverride: ReturnType<typeof vi.fn>;
};

function facadeStub(): FacadeStub {
  return { saveSettings: vi.fn(), saveWeeklyAvailability: vi.fn(), saveOverride: vi.fn(), deleteOverride: vi.fn() } as unknown as FacadeStub;
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return { settings: DEFAULT_SCHEDULE_SETTINGS, weeklyAvailability: [], overrides: [], ...overrides };
}

async function renderAvailability({ facade = facadeStub(), scopeKey = "tech-1", schedule: initialSchedule = schedule() }: { facade?: FacadeStub; scopeKey?: string; schedule?: Schedule } = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const document = window.document as unknown as Document;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = (nextScope: string, nextSchedule: Schedule) => root.render(<AvailabilityEditor scopeKey={nextScope} schedule={nextSchedule} facade={facade} />);
  await act(async () => render(scopeKey, initialSchedule));
  return {
    container,
    document,
    rerender: async ({ scopeKey: nextScope, schedule: nextSchedule }: { scopeKey: string; schedule: Schedule }) => act(async () => render(nextScope, nextSchedule)),
    cleanup: () => { act(() => root.unmount()); window.close(); }
  };
}

function dayNamed(container: HTMLElement, name: string) {
  const day = Array.from(container.querySelectorAll<HTMLElement>(".schedule-day")).find((candidate) => candidate.textContent?.includes(name));
  if (!day) throw new Error(`${name} was not rendered`);
  return day;
}

function buttonIn(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Button ${name} was not rendered`);
  return button;
}

function inputNamed(container: HTMLElement, label: string) {
  const field = Array.from(container.querySelectorAll<HTMLLabelElement>("label")).find((candidate) => candidate.querySelector(":scope > span")?.textContent === label);
  return field?.querySelector<HTMLInputElement>("input") ?? null;
}

function radioNamed(container: HTMLElement, label: string) {
  const field = Array.from(container.querySelectorAll<HTMLLabelElement>("label")).find((candidate) => candidate.textContent?.trim() === label);
  const radio = field?.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!radio) throw new Error(`Radio ${label} was not rendered`);
  return radio;
}

async function setValue(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("Expected form field");
  const view = input.ownerDocument.defaultView;
  await act(async () => {
    Object.getOwnPropertyDescriptor(view?.HTMLInputElement.prototype ?? {}, "value")?.set?.call(input, value);
    input.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
    input.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  });
}

async function select(control: HTMLSelectElement | undefined | null, value: string) {
  if (!control) throw new Error("Expected select control");
  const view = control.ownerDocument.defaultView;
  await act(async () => {
    Object.getOwnPropertyDescriptor(view?.HTMLSelectElement.prototype ?? {}, "value")?.set?.call(control, value);
    control.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  });
}

async function selectPeriod(day: HTMLElement, index: number, start: string, end: string) {
  const periodCount = day.querySelectorAll<HTMLElement>(".schedule-period").length;
  if (index >= periodCount) throw new Error(`Period ${index + 1} was not rendered`);
  let period = day.querySelectorAll<HTMLElement>(".schedule-period")[index];
  await select(period.querySelector<HTMLSelectElement>("select"), start);
  period = day.querySelectorAll<HTMLElement>(".schedule-period")[index];
  const controls = period.querySelectorAll<HTMLSelectElement>("select");
  await select(controls[1], end);
}

async function click(control: HTMLButtonElement | HTMLInputElement) {
  await act(async () => control.click());
}

async function submit(form: Element | null) {
  if (!form) throw new Error("Expected form");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await flush();
}

function submitWithoutWaiting(form: Element | null) {
  if (!form) throw new Error("Expected form");
  act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
