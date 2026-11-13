import { Window } from "happy-dom";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DiscoverSearch } from "../discover-search";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DiscoverSearch", () => {
  it("calls the provided current-location handler", async () => {
    const onUseCurrentLocation = vi.fn();
    const view = await renderSearch(onUseCurrentLocation);

    const locationButton = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Use my location"]'
    );
    expect(locationButton).not.toBeNull();

    await act(async () => locationButton?.click());

    expect(onUseCurrentLocation).toHaveBeenCalledOnce();
    view.cleanup();
  });
});

async function renderSearch(onUseCurrentLocation: () => void) {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      <DiscoverSearch
        query=""
        location=""
        activeFilterCount={0}
        filterTriggerRef={createRef<HTMLButtonElement>()}
        onQueryChange={vi.fn()}
        onLocationSelect={vi.fn()}
        onLocationClear={vi.fn()}
        onUseCurrentLocation={onUseCurrentLocation}
        onSearch={vi.fn()}
        onOpenFilters={vi.fn()}
      />
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      window.close();
    }
  };
}
