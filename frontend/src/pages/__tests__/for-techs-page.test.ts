import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";

const { push, registerUser, toast } = vi.hoisted(() => ({
  push: vi.fn(),
  registerUser: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() }
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/common/location-autocomplete", () => ({ default: () => null }));
vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  registerUser
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const initialWindow = new Window();
Object.assign(globalThis, { window: initialWindow, document: initialWindow.document, HTMLElement: initialWindow.HTMLElement, Event: initialWindow.Event });
const { createRoot } = await import("react-dom/client");
const { default: ForTechsPage } = await import("../for-techs-page");

describe("ForTechsPage signup", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("offers an optional referral-code field to new tech accounts", async () => {
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    await waitFor(() => expect(buttonNamed(view.container, "Have a referral code?")).not.toBeNull());
    expect(inputNamed(view.container, "Referral code")).toBeNull();
    await act(async () => buttonNamed(view.container, "Have a referral code?")?.click());
    expect(inputNamed(view.container, "Referral code")).not.toBeNull();

    await act(async () => buttonNamed(view.container, "Log in")?.click());
    expect(inputNamed(view.container, "Referral code")).toBeNull();
    view.cleanup();
  });

  it("keeps the onboarding account controls visible", async () => {
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    await waitFor(() => expect(view.container.textContent).toContain("Create a tech account"));
    expect(view.container.textContent).toContain("Create your free profile");
    expect(buttonNamed(view.container, "Create tech account")).not.toBeNull();
    view.cleanup();
  });

  it("uses the same split auth shell as the header account flow", async () => {
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]');
    const accountAuthSource = readFileSync(new URL("../../components/layout/account/account-auth-modal.tsx", import.meta.url), "utf8");
    const techModalSource = readFileSync(new URL("../for-techs/tech-signup-modal.tsx", import.meta.url), "utf8");

    expect(dialog?.classList.contains("muse-auth")).toBe(true);
    expect(dialog?.querySelector(".muse-auth__visual")).not.toBeNull();
    expect(buttonNamed(dialog!, "New account")).toBeNull();
    expect(buttonNamed(dialog!, "Log in")).not.toBeNull();
    expect(accountAuthSource).toContain("AuthSplitShell");
    expect(techModalSource).toContain("AuthSplitShell");
    view.cleanup();
  });

  it("uses the editorial beta badge and a high-contrast signup action", async () => {
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    const badge = view.container.querySelector(".muse-beta-badge");
    const signupButton = buttonNamed(view.container, "Create tech account");
    const styles = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");

    expect(badge).not.toBeNull();
    expect(badge?.textContent ?? "").toContain("Free during beta");
    expect(signupButton?.classList.contains("muse-tech-signup-submit")).toBe(true);
    expect(styles).toMatch(/\.muse-beta-badge\s*\{[^}]*background:\s*var\(--editorial-ink\);[^}]*color:\s*var\(--editorial-paper\);/s);
    expect(styles).toMatch(/\.muse-tech-signup-submit\s*\{[^}]*background:\s*var\(--editorial-ink\);[^}]*color:\s*var\(--editorial-paper\);/s);
    view.cleanup();
  });

  it("shows the publish control after a tech creates an account", async () => {
    registerUser.mockResolvedValue({
      id: "tech-1",
      email: "tech@example.com",
      fullName: "Mia Chen",
      role: "TECH"
    });
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    await act(async () => setInputValue(inputNamed(view.container, "Full name"), "Mia Chen"));
    await act(async () => setInputValue(inputNamed(view.container, "Email address"), "tech@example.com"));
    await act(async () => setInputValue(inputNamed(view.container, "Password"), "password123456"));
    const signupForm = view.container.querySelector("form");
    if (!signupForm) throw new Error("Signup form was not rendered");
    await act(async () => signupForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(registerUser).toHaveBeenCalled();
    await waitFor(() => expect(buttonNamed(view.container, "Publish profile")).not.toBeNull());
    view.cleanup();
  });

  it("hands a newly published tech to schedule setup without legacy service fields", async () => {
    registerUser.mockResolvedValue({ id: "tech-1", email: "tech@example.com", fullName: "Mia Chen", role: "TECH" });
    const view = await renderPage();
    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());
    await act(async () => setInputValue(inputNamed(view.container, "Full name"), "Mia Chen"));
    await act(async () => setInputValue(inputNamed(view.container, "Email address"), "tech@example.com"));
    await act(async () => setInputValue(inputNamed(view.container, "Password"), "password123456"));
    await act(async () => view.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    const source = readFileSync(new URL("../for-techs-page.tsx", import.meta.url), "utf8");
    expect(view.container.textContent).not.toMatch(/booking url|featured service|starting price/i);
    expect(source).toContain("Set up services and availability");
    expect(source).toMatch(/router\.push\("\/schedule"\)/);
    view.cleanup();
  });

  it("explains public service areas without promising a street address", async () => {
    const view = await renderPage();
    expect(view.container.querySelector(".editorial-for-techs")).not.toBeNull();
    expect(view.container.textContent).toContain("your city and nearby areas");
    view.cleanup();
  });

  it("removes the standalone referral promotion without removing referral guidance", async () => {
    const view = await renderPage();

    expect(view.container.textContent).not.toContain("Know a fellow tech?");
    expect(view.container.textContent).not.toContain("avoro.app/join?ref=yourhandle");
    expect(view.container.textContent).toContain("Referral rewards");
    expect(view.container.textContent).toContain("How does the referral program work?");
    view.cleanup();
  });

  it("uses a white background for the growth features section", async () => {
    const view = await renderPage();
    const heading = Array.from(view.container.querySelectorAll("h2")).find(
      (element) => element.textContent?.trim() === "Everything you need to grow"
    );
    const section = heading?.closest("section");

    expect(section?.classList.contains("bg-white")).toBe(true);
    expect(section?.classList.contains("bg-[#FDF7F4]")).toBe(false);
    view.cleanup();
  });

  it("gives the Common questions cards deliberate stacked spacing", async () => {
    const view = await renderPage();
    const heading = Array.from(view.container.querySelectorAll("h2")).find(
      (element) => element.textContent?.trim() === "Common questions"
    );
    const section = heading?.closest("section");
    const list = heading?.nextElementSibling;
    const cards = Array.from(section?.querySelectorAll(".editorial-for-techs-faq-card") ?? []);

    expect(heading?.classList.contains("mb-12")).toBe(true);
    expect(list?.classList.contains("space-y-6")).toBe(true);
    expect(cards).toHaveLength(5);
    expect(cards.every((card) => !card.classList.contains("editorial-faq"))).toBe(true);
    expect(cards.every((card) => card.classList.contains("p-7") && card.classList.contains("md:p-8"))).toBe(true);
    expect(cards.every((card) => card.querySelector("h4")?.classList.contains("mb-3"))).toBe(true);
    view.cleanup();
  });

  it("renders the bottom CTA as a Playfair heading without a decorative user icon", async () => {
    const view = await renderPage();
    const heading = Array.from(view.container.querySelectorAll("h2")).find((element) => element.textContent?.trim() === "Ready to grow your book?");

    expect(heading).not.toBeNull();
    expect((heading as HTMLElement).style.fontFamily).toBe('"Playfair Display", serif');
    expect(buttonNamed(view.container, "Create your free profile")).not.toBeNull();
    expect(heading?.closest("section")?.querySelector("svg.lucide-users")).toBeNull();
    view.cleanup();
  });
});

async function renderPage() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => { root.render(createElement(ForTechsPage)); });
  return { container, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function buttonNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === name) ?? null;
}

function inputNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes(name))?.querySelector("input") ?? null;
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("Expected input to be rendered");
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView?.HTMLInputElement.prototype ?? {}, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 9) throw error;
      await act(async () => { await Promise.resolve(); });
    }
  }
}
