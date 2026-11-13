import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DiscoverFilters } from "../discover-filters";
import type { PriceRangeFilter } from "@/utils/marketplace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DiscoverFilters", () => {
  it("applies multiple drafted price ranges together", async () => {
    const onApply = vi.fn();
    const view = await renderFilters({ onApply });

    await act(async () => button(view.container, "Under $60")?.click());
    await act(async () => button(view.container, "$100 – $150")?.click());
    await act(async () => button(view.container, "Apply filters")?.click());

    expect(onApply).toHaveBeenCalledWith(["under-60", "100-150"]);
    view.cleanup();
  });

  it("clears the draft before applying", async () => {
    const onApply = vi.fn();
    const view = await renderFilters({ selectedPriceRanges: ["60-100", "150-plus"], onApply });

    await act(async () => button(view.container, "Clear")?.click());
    await act(async () => button(view.container, "Apply filters")?.click());

    expect(onApply).toHaveBeenCalledWith([]);
    view.cleanup();
  });

  it("dismisses without applying from the close button and Escape", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const view = await renderFilters({ onApply, onClose });

    await act(async () => buttonByLabel(view.container, "Close filters")?.click());
    await act(async () => view.window.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Escape" })));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("renders an accessible modal only while open", async () => {
    const openView = await renderFilters();
    expect(openView.container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(openView.container.querySelector("#discover-filter-title")?.textContent).toBe("Filter");
    openView.cleanup();

    const closedView = await renderFilters({ isOpen: false });
    expect(closedView.container.querySelector('[role="dialog"]')).toBeNull();
    closedView.cleanup();
  });
});

function button(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label
  );
}

function buttonByLabel(container: HTMLElement, label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
}

async function renderFilters({
  isOpen = true,
  selectedPriceRanges = [],
  onApply = vi.fn(),
  onClose = vi.fn()
}: Partial<{
  isOpen: boolean;
  selectedPriceRanges: PriceRangeFilter[];
  onApply: (ranges: PriceRangeFilter[]) => void;
  onClose: () => void;
}> = {}) {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent
  });
  const document = window.document as unknown as Document;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      <DiscoverFilters
        isOpen={isOpen}
        selectedPriceRanges={selectedPriceRanges}
        onApply={onApply}
        onClose={onClose}
      />
    );
  });

  return {
    container,
    window,
    cleanup: () => {
      act(() => root.unmount());
      window.close();
    }
  };
}
