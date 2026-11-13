import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAuthProvider } from "../../../../context/account-auth-context";
import { AuthSplitShell } from "../auth-split-shell";
import { SiteHeader } from "../../site-header";

const { getCurrentUser, loginUser, logoutUser, registerUser, push } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  registerUser: vi.fn(),
  push: vi.fn()
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock("@/hooks/router", () => ({
  usePathname: () => "/artists/tech-1/book",
  useRouter: () => ({ push })
}));

vi.mock("../../../../context/messaging-context", () => ({
  useMessaging: () => ({ enabled: false, unread: { unreadMessages: 0, pendingRequests: 0, total: 0 }, connectionState: "disconnected", workspace: null, facade: null, refreshUnread: vi.fn() })
}));


vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  getCurrentUser,
  updateAccount: vi.fn(),
  loginUser,
  logoutUser,
  registerUser
}));

vi.mock("@/components/common/saved-techs-modal", () => ({
  SavedTechsModal: () => null
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("AccountAuthModal accessibility", () => {
  afterEach(() => vi.resetAllMocks());

  it("opens recovery from login and returns focus to the login email field", async () => {
    const view = await renderHeader();
    await openAuth(view, "Log in");
    await act(async () => buttonNamed(view.container, "Forgot password?").click());
    expect(view.container.textContent).toContain("Forgot your password?");
    expect(document.activeElement).toBe(view.container.querySelector('input[name="email"]'));
    await act(async () => buttonNamed(view.container, "Back to log in").click());
    expect(view.container.textContent).toContain("Welcome back to avoro");
    expect(document.activeElement).toBe(view.container.querySelector('input[name="email"]'));
    view.cleanup();
  });

  it("moves focus to the login email field and the signup full-name field", async () => {
    const view = await renderHeader();

    const loginTrigger = await openAuth(view, "Log in");
    expect(document.activeElement).toBe(view.container.querySelector('input[name="email"]'));

    await closeWithEscape(view);
    expect(document.activeElement).toBe(loginTrigger);

    await openAuth(view, "Create account");
    expect(document.activeElement).toBe(view.container.querySelector('input[name="fullName"]'));

    view.cleanup();
  });

  it("traps forward and backward Tab movement inside the dialog", async () => {
    const view = await renderHeader();
    await openAuth(view, "Log in");
    const dialog = authDialog(view.container);
    const focusable = focusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1)!;

    last.focus();
    await pressKey(last, "Tab");
    expect(document.activeElement).toBe(first);

    first.focus();
    await pressKey(first, "Tab", true);
    expect(document.activeElement).toBe(last);

    view.cleanup();
  });

  it("closes on Escape and restores the exact trigger that opened it", async () => {
    const view = await renderHeader();
    const trigger = await openAuth(view, "Log in");

    await closeWithEscape(view);

    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  it("closes from the inner close control and restores its trigger", async () => {
    const view = await renderHeader();
    const trigger = await openAuth(view, "Create account");
    const dialog = authDialog(view.container);
    const close = buttonWithLabel(dialog, "Close");

    close.focus();
    await act(async () => close.click());

    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  it("uses a non-submit labeled backdrop that closes without treating dialog clicks as backdrop clicks", async () => {
    const view = await renderHeader();
    const trigger = await openAuth(view, "Log in");
    const dialog = authDialog(view.container);
    const backdrop = buttonWithLabel(view.container, "Close auth dialog");

    expect(backdrop.type).toBe("button");
    await act(async () => dialog.click());
    expect(view.container.querySelector('[role="dialog"]')).toBe(dialog);

    backdrop.focus();
    await act(async () => backdrop.click());
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  it("moves focus to the appropriate first field when switching modes", async () => {
    const view = await renderHeader();
    await openAuth(view, "Log in");
    let dialog = authDialog(view.container);

    await act(async () => buttonNamed(dialog, "Create account").click());
    dialog = authDialog(view.container);
    expect(document.activeElement).toBe(dialog.querySelector('input[name="fullName"]'));

    await act(async () => buttonNamed(dialog, "Log in").click());
    dialog = authDialog(view.container);
    expect(document.activeElement).toBe(dialog.querySelector('input[name="email"]'));

    view.cleanup();
  });

  it("focuses the shared dialog itself when no initial focus target is provided", async () => {
    const view = await renderSharedShell();
    const trigger = buttonNamed(view.container, "Open shared auth");
    trigger.focus();

    await act(async () => trigger.click());
    const dialog = authDialog(view.container);
    expect(document.activeElement).toBe(dialog);

    const focusable = focusableElements(dialog);
    await pressKey(dialog, "Tab");
    expect(document.activeElement).toBe(focusable[0]);

    dialog.focus();
    await pressKey(dialog, "Tab", true);
    expect(document.activeElement).toBe(focusable.at(-1));

    dialog.focus();
    await pressKey(dialog, "Escape");
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });

  it("shows the avoro wordmark without a brand icon", async () => {
    const view = await renderSharedShell();

    await act(async () => buttonNamed(view.container, "Open shared auth").click());
    const brands = Array.from(authDialog(view.container).querySelectorAll(".muse-auth__brand"));

    expect(brands).toHaveLength(2);
    for (const brand of brands) {
      expect(brand.textContent?.trim()).toBe("avoro");
      expect(brand.querySelector("svg")).toBeNull();
    }

    view.cleanup();
  });
});

async function renderHeader() {
  getCurrentUser.mockResolvedValue(null);
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    Node: window.Node
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<AccountAuthProvider><SiteHeader /></AccountAuthProvider>);
    await Promise.resolve();
  });
  return {
    container,
    window,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
      window.close();
    }
  };
}

async function renderSharedShell() {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    Node: window.Node
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => root.render(<SharedShellProbe />));
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
      window.close();
    }
  };
}

function SharedShellProbe() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open shared auth</button>
    {open ? (
      <AuthSplitShell titleId="shared-auth-title" onClose={() => setOpen(false)}>
        <h2 id="shared-auth-title">Shared auth</h2>
        <button type="button">Continue</button>
      </AuthSplitShell>
    ) : null}
  </>;
}

async function openAuth(view: Awaited<ReturnType<typeof renderHeader>>, name: "Log in" | "Create account") {
  const trigger = buttonNamed(view.container, name);
  trigger.focus();
  await act(async () => trigger.click());
  expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
  return trigger;
}

async function closeWithEscape(view: Awaited<ReturnType<typeof renderHeader>>) {
  const dialog = authDialog(view.container);
  const focused = document.activeElement as HTMLElement;
  await pressKey(dialog.contains(focused) ? focused : dialog, "Escape");
}

async function pressKey(
  target: HTMLElement,
  key: string,
  shiftKey = false
) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true
    }));
  });
}

function authDialog(container: HTMLElement) {
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error("Expected auth dialog");
  return dialog;
}

function buttonNamed(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Expected button named ${name}`);
  return button;
}

function buttonWithLabel(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Expected button labeled ${label}`);
  return button;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  ));
}
