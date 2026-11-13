import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScheduleTabs } from "../schedule-tabs";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("moves through tabs with arrow keys and activates the focused tab", async () => {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, KeyboardEvent: window.KeyboardEvent });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root.render(<ScheduleTabs activeTab="bookings" onChange={onChange} />));
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  tabs[0].focus();
  await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

  expect(onChange).toHaveBeenCalledWith("availability");
  expect(document.activeElement).toBe(tabs[1]);
  act(() => root.unmount());
  window.close();
});
