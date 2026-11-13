import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BeautyShell from "../beauty-shell";
import { AccountAuthProvider, useAccountAuth } from "../../../context/account-auth-context";

const { getCurrentUser, logoutUser, push, useMessaging } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
  push: vi.fn(),
  useMessaging: vi.fn()
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock("@/hooks/router", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push })
}));


vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  getCurrentUser,
  updateAccount: vi.fn(),
  logoutUser
}));

vi.mock("@/components/common/saved-techs-modal", () => ({
  SavedTechsModal: () => null
}));

vi.mock("../../../context/messaging-context", () => ({
  MessagingProvider: ({ children }: { children: ReactNode }) => children,
  useMessaging
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("AccountSettingsModal accessibility", () => {
  beforeEach(() => {
    useMessaging.mockReturnValue({ enabled: false, unread: { unreadMessages: 0, pendingRequests: 0, total: 0 }, connectionState: "disconnected", live: null, refreshUnread: vi.fn() });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("keeps the role-aware navigation and account entry points available", async () => {
    getCurrentUser.mockResolvedValue(null);
    const view = await renderShell();

    expect(buttonNamed(view.container, "Create account")).not.toBeNull();
    expect(buttonNamed(view.container, "avoro")).not.toBeNull();
    expect(buttonNamed(view.container, "Home")).not.toBeNull();
    expect(buttonNamed(view.container, "Discover")).not.toBeNull();
    expect(view.container.querySelector('nav[aria-label="Primary navigation"]')).not.toBeNull();
    const mobileToggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls="mobile-navigation"]');
    expect(mobileToggle?.getAttribute("aria-expanded")).toBe("false");

    view.cleanup();
  });

  it("keeps the editorial footer current and its social link labeled", async () => {
    getCurrentUser.mockResolvedValue(null);
    const view = await renderShell();

    expect(view.container.textContent).toContain("© 2026 avoro Inc.");
    const instagramLink = view.container.querySelector<HTMLAnchorElement>('[aria-label="Instagram"]');
    expect(instagramLink?.getAttribute("href")).toBe("https://www.instagram.com/avorobeauty");
    expect(instagramLink?.getAttribute("target")).toBe("_blank");
    expect(instagramLink?.getAttribute("rel")).toBe("noopener noreferrer");

    view.cleanup();
  });

  it("exposes the create-account form as a dialog", async () => {
    getCurrentUser.mockResolvedValue(null);
    const view = await renderShell();

    await act(async () => {
      buttonNamed(view.container, "Create account")?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true })
      );
    });

    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("muse-auth")).toBe(true);
    expect(dialog?.querySelector(".muse-auth__visual")).not.toBeNull();
    expect(dialog?.textContent).toContain("Create your avoro account");

    await act(async () => {
      buttonNamed(dialog!, "Log in")?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true })
      );
    });

    expect(dialog?.textContent).toContain("Welcome back to avoro");

    view.cleanup();
  });

  it("labels the account settings dialog with its visible heading", () => {
    const source = readFileSync(new URL("../account/account-settings-modal.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby="account-settings-title"/);
    expect(source).toMatch(/<h2[\s\S]*id="account-settings-title"[\s\S]*>\s*General\s*<\/h2>/);
  });

  it("uses a responsive settings workspace with an active general section", () => {
    const source = readFileSync(new URL("../account/account-settings-modal.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="editorial-dialog muse-settings"');
    expect(source).toContain('className="muse-settings__rail"');
    expect(source).toContain('className="muse-settings__nav-item is-active"');
    expect(source).toContain('aria-current="page"');
    expect(source).toContain('className="muse-settings__content"');
    expect(source).toContain('className="muse-settings__account-card"');
    expect(source).toContain('className="muse-settings__actions"');
  });

  it("uses the profile navigation destination for signed-in techs", () => {
    const routes = readFileSync(new URL("../../../routes/app-routes.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(routes).toMatch(/path="\/tech-profile" element={<TechProfilePage \/>}\s*\/>/);
    expect(shell).toMatch(/const techNavLabel = authUser\?\.role === "TECH" \? "My Profile" : "For Techs";/);
    expect(shell).toMatch(/const techNavPath = authUser\?\.role === "TECH" \? "\/tech-profile" : "\/for-techs";/);
    expect(shell).toMatch(/navLink\("Home", "\/"\).*navLink\("Discover", "\/discover"\).*navLink\("How It Works", "\/how-it-works"\)/s);
    expect(shell).toMatch(/navLink\("Home", "\/"\).*navLink\("Discover", "\/discover"\).*navLink\("How It Works", "\/how-it-works"\).*navLink\(techNavLabel, techNavPath\)/s);
    expect(shell).not.toMatch(/Edit my profile/);
  });

  it("keeps My bookings customer-only in both account menus and retains saved techs and settings", () => {
    const routes = readFileSync(new URL("../../../routes/app-routes.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(routes).toMatch(/path="\/bookings" element={<CustomerBookingsPage \/>}\s*\/>/);
    expect(shell).toMatch(/authUser\.role === "CUSTOMER" \? <><button[\s\S]*My bookings[\s\S]*Saved techs/s);
    expect(shell).toContain('router.push("/bookings"); setOpen(false);');
    expect(shell).toContain('setMenuOpen(false); onBookings();');
    expect(shell).toContain("Account settings");
  });

  it("offers Schedule only to authenticated techs, never admins", () => {
    const shell = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(shell).toMatch(/authUser\.role === "TECH" \? <><button[^>]*onClick=\{\(\) => \{ router\.push\("\/schedule"\)/s);
    expect(shell).toMatch(/authUser\.role === "TECH" \? <><button[^>]*onClick=\{\(\) => \{ setMenuOpen\(false\); onSchedule\(\); \}\}/s);
    expect(shell).not.toMatch(/authUser\.role === "CUSTOMER" \?[\s\S]*: <button[^>]*Schedule/s);
  });

  it("exposes Messages with an unread count only to enabled customer and tech sessions", () => {
    const shell = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(shell).toMatch(/useMessaging\(\)/);
    expect(shell).toMatch(/authUser\?\.role === "CUSTOMER" \|\| authUser\?\.role === "TECH"/);
    expect(shell).toContain('router.push("/messages")');
    expect(shell).toContain('aria-label={`Messages, ${unreadTotal} unread`}');
    expect(shell).toMatch(/unreadTotal > 0 \? <span[^>]*>\{unreadTotal\}<\/span> : null/);
  });

  it("dismisses the account dropdown on outside clicks and route changes", () => {
    const source = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/const menuRef = useRef<HTMLDivElement>\(null\);/);
    expect(source).toMatch(/document\.addEventListener\("mousedown", handleOutsideClick\)/);
    expect(source).toMatch(/if \(!menuRef\.current\?\.contains\(event\.target as Node\)\) setMenuOpen\(false\);/);
    expect(source).toMatch(/useEffect\(\(\) => \{\s*setMenuOpen\(false\);\s*\}, \[pathname\]\);/);
  });

  it("lets the account provider own one initial session and complete authentication for the header", async () => {
    getCurrentUser.mockResolvedValue({ id: "customer-1", email: "avery@example.com", role: "CUSTOMER", fullName: "Avery", avatarUrl: null });
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AccountAuthProvider, undefined, createElement(AuthProbe)));
      await Promise.resolve();
    });

    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Avery");
    expect(container.textContent).toContain("ready");
    await act(async () => {
      buttonNamed(container, "Open")?.click();
      buttonNamed(container, "Complete")?.click();
    });
    expect(container.textContent).toContain("new@example.com");
    expect(container.textContent).toContain("closed");

    act(() => root.unmount());
    window.close();
  });

  it("keeps session loading out of the site header after the provider takes ownership", () => {
    const provider = readFileSync(new URL("../../../context/account-auth-context.tsx", import.meta.url), "utf8");
    const header = readFileSync(new URL("../site-header.tsx", import.meta.url), "utf8");

    expect(provider).toContain("getCurrentUser");
    expect(provider).toContain("completeAuthentication");
    expect(header).not.toContain("getCurrentUser");
  });

  it("does not let a stale initial session overwrite authentication or sign-out", async () => {
    const session = deferred<{ id: string; email: string; role: "CUSTOMER"; fullName: string | null; avatarUrl: string | null } | null>();
    getCurrentUser.mockReturnValue(session.promise);
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AccountAuthProvider, undefined, createElement(AuthProbe)));
    });
    await act(async () => buttonNamed(container, "Complete")?.click());
    expect(container.textContent).toContain("new@example.com");
    expect(container.textContent).toContain("ready");
    await act(async () => {
      session.resolve({ id: "stale", email: "stale@example.com", role: "CUSTOMER", fullName: "Stale", avatarUrl: null });
      await session.promise;
    });
    expect(container.textContent).toContain("new@example.com");
    expect(container.textContent).not.toContain("Stale");

    act(() => root.unmount());
    window.close();
  });

  it("keeps the authenticated UI when logout fails after invalidating the bootstrap", async () => {
    const session = deferred<{ id: string; email: string; role: "CUSTOMER"; fullName: string | null; avatarUrl: string | null } | null>();
    getCurrentUser.mockReturnValue(session.promise);
    logoutUser.mockRejectedValue(new Error("Logout unavailable"));
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(createElement(AccountAuthProvider, undefined, createElement(AuthProbe))));
    await act(async () => buttonNamed(container, "Complete")?.click());
    await act(async () => buttonNamed(container, "Sign out")?.click());
    await act(async () => {
      session.resolve(null);
      await session.promise;
    });

    expect(container.textContent).toContain("new@example.com");
    expect(container.textContent).toContain("ready");
    expect(container.textContent).toContain("Logout unavailable");

    act(() => root.unmount());
    window.close();
  });

  it("offers an optional referral-code field only for new tech accounts", () => {
    const source = readFileSync(new URL("../account/account-auth-modal.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/const \[isReferralCodeVisible, setIsReferralCodeVisible\] = useState\(false\);/);
    expect(source).toMatch(/mode === "register" && role === "TECH" \?.*isReferralCodeVisible/s);
    expect(source).toMatch(/setIsReferralCodeVisible\(true\).*Have a referral code\?/s);
    expect(source).toMatch(/isReferralCodeVisible \?.*label="Referral code"/s);
    expect(source).toMatch(/registerUser\(\{.*email: form\.email,.*password: form\.password,.*fullName: form\.fullName \|\| undefined,.*role.*\}\)/s);
  });
});

async function renderShell() {
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
    root.render(createElement(MemoryRouter, undefined, createElement(BeautyShell, undefined, createElement("div", undefined, "Route body"))));
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      window.close();
    }
  };
}

function buttonNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === name) ?? null;
}

function AuthProbe() {
  const { authUser, isAuthLoading, mode, openAccountAuth, completeAuthentication, signOut } = useAccountAuth();
  return createElement("div", undefined,
    createElement("span", undefined, authUser ? authUser.fullName ?? authUser.email : "Anonymous"),
    createElement("span", undefined, isAuthLoading ? "loading" : "ready"),
    createElement("span", undefined, mode ?? "closed"),
    createElement("span", { id: "logout-error" }),
    createElement("button", { type: "button", onClick: () => openAccountAuth("login") }, "Open"),
    createElement("button", { type: "button", onClick: () => completeAuthentication({ id: "customer-2", email: "new@example.com", role: "CUSTOMER", fullName: null, avatarUrl: null }) }, "Complete"),
    createElement("button", { type: "button", onClick: () => { void signOut().catch((error: unknown) => { const target = document.querySelector("#logout-error"); if (target) target.textContent = error instanceof Error ? error.message : "Logout failed"; }); } }, "Sign out")
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
