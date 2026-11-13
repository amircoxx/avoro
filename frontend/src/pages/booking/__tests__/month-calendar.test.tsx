import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthCalendar } from "../month-calendar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MonthCalendar", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the complete month grid with correctly disabled leading and trailing dates", () => {
    const view = renderCalendar();
    const dayButtons = Array.from(view.container.querySelectorAll<HTMLButtonElement>("[data-calendar-date]"));

    expect(view.container.querySelector("[role='grid']")?.getAttribute("aria-label")).toBe("July 2026");
    expect(dayButtons).toHaveLength(35);
    expect(dayButtons[0]?.dataset.calendarDate).toBe("2026-06-28");
    expect(dayButtons[0]?.dataset.outsideMonth).toBe("true");
    expect(dayButtons[0]?.disabled).toBe(true);
    expect(dayButtons.at(-1)?.dataset.calendarDate).toBe("2026-08-01");
    expect(dayButtons.at(-1)?.dataset.outsideMonth).toBe("true");
    expect(dayButtons.at(-1)?.disabled).toBe(true);
    view.cleanup();
  });

  it("enables only server-available dates and exposes selection without relying on color", () => {
    const view = renderCalendar({ availableDates: ["2026-07-14"], selectedDate: "2026-07-14" });
    const selected = day(view.container, "2026-07-14");
    const unavailable = day(view.container, "2026-07-15");

    expect(selected.disabled).toBe(false);
    expect(selected.hasAttribute("aria-selected")).toBe(false);
    expect(selected.closest("[role='gridcell']")?.getAttribute("aria-selected")).toBe("true");
    expect(selected.getAttribute("aria-label")).toContain("available, selected");
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.getAttribute("aria-label")).toContain("unavailable");
    view.cleanup();
  });

  it("supports month navigation and keyboard date activation", async () => {
    const onPreviousMonth = vi.fn();
    const onNextMonth = vi.fn();
    const onSelectDate = vi.fn();
    const view = renderCalendar({ availableDates: ["2026-07-14"], onPreviousMonth, onNextMonth, onSelectDate });

    await act(async () => {
      button(view.container, "Previous month").click();
      button(view.container, "Next month").click();
      day(view.container, "2026-07-14").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
    expect(onSelectDate).toHaveBeenCalledWith("2026-07-14");
    view.cleanup();
  });

  it("identifies today's date in the technician timezone rather than the visitor timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T02:00:00.000Z"));
    const view = renderCalendar({ availableDates: ["2026-07-31"], timeZone: "America/New_York" });

    expect(day(view.container, "2026-07-31").getAttribute("aria-current")).toBe("date");
    expect(day(view.container, "2026-08-01").hasAttribute("aria-current")).toBe(false);
    view.cleanup();
    vi.useRealTimers();
  });
});

function renderCalendar(overrides: Partial<Parameters<typeof MonthCalendar>[0]> = {}) {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    KeyboardEvent: window.KeyboardEvent,
    Event: window.Event
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(<MonthCalendar month="2026-07" availableDates={[]} selectedDate={null} onSelectDate={vi.fn()} onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} {...overrides} />));
  return { container, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function day(container: HTMLElement, date: string) {
  return container.querySelector<HTMLButtonElement>(`[data-calendar-date='${date}']`)!;
}

function button(container: HTMLElement, label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`)!;
}
