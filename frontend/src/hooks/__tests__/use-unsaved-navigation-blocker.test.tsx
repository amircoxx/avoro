// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useUnsavedNavigationBlocker } from "../use-unsaved-navigation-blocker";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("useUnsavedNavigationBlocker", () => {
  it("cancels route navigation without leaving a dirty profile route", async () => {
    const confirm = vi.fn(() => false);
    const onDiscard = vi.fn();
    const router = createMemoryRouter([
      { path: "/home", element: <p>Home</p> },
      { path: "/draft", element: <DraftRoute confirm={confirm} onDiscard={onDiscard} /> },
      { path: "/next", element: <p>Next</p> }
    ], { initialEntries: ["/draft"] });
    const view = await render(<RouterProvider router={router} />);

    await act(async () => { await router.navigate("/next"); });

    expect(confirm).toHaveBeenCalledWith("Discard unsaved profile changes?");
    expect(router.state.location.pathname).toBe("/draft");
    expect(onDiscard).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("cancels browser Back and Forward transitions without guessing history direction", async () => {
    const confirm = vi.fn(() => false);
    const router = createMemoryRouter([
      { path: "/home", element: <p>Home</p> },
      { path: "/draft", element: <DraftRoute confirm={confirm} onDiscard={vi.fn()} /> },
      { path: "/next", element: <p>Next</p> }
    ], { initialEntries: ["/home", "/draft", "/next"], initialIndex: 1 });
    const view = await render(<RouterProvider router={router} />);

    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe("/draft");
    await act(async () => { await router.navigate(1); });
    expect(router.state.location.pathname).toBe("/draft");
    expect(confirm).toHaveBeenCalledTimes(2);
    view.cleanup();
  });
});

function DraftRoute({ confirm, onDiscard }: { confirm: (message: string) => boolean; onDiscard: () => void }) {
  const navigate = useNavigate();
  useUnsavedNavigationBlocker(true, { confirm, onDiscard });
  return <button type="button" onClick={() => navigate("/next")}>Go next</button>;
}

async function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => { root.render(element); });
  return { cleanup: () => act(() => root.unmount()) };
}
