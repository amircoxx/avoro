import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BeautyShell from "@/components/layout/beauty-shell";
import { AccountAuthProvider } from "@/context/account-auth-context";
import HowItWorksPage from "../how-it-works-page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const cleanupCallbacks: Array<() => Promise<void>> = [];

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  getCurrentUser: vi.fn().mockResolvedValue(null)
}));

vi.mock("@/hooks/router", () => ({
  usePathname: () => "/how-it-works",
  useRouter: () => ({ push })
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("HowItWorksPage", () => {
  afterEach(async () => {
    for (const cleanup of cleanupCallbacks.splice(0)) await cleanup();
    vi.clearAllMocks();
  });

  it("presents the customer journey as three ordered decisions", async () => {
    const view = await renderPage();
    const journey = view.container.querySelector('[aria-label="How avoro works for customers"]');
    const steps = journey?.querySelectorAll(":scope > li");

    expect(journey?.tagName).toBe("OL");
    expect(steps).toHaveLength(3);
    expect(journey?.textContent).toContain("Search near you");
    expect(journey?.textContent).toContain("Compare the work");
    expect(journey?.textContent).toContain("Connect directly");
  });

  it("routes customers to discovery", async () => {
    const view = await renderPage();

    await act(async () => buttonNamed(view.container, "Find an artist")?.click());
    expect(push).toHaveBeenCalledWith("/discover");
  });

  it("opens the create account overlay from the tech CTA without navigating", async () => {
    const view = await renderPage(true);

    await act(async () => buttonNamed(view.container, "Create your free profile")?.click());

    expect(push).not.toHaveBeenCalledWith("/for-techs");
    expect(view.container.querySelector('[role="dialog"]')?.textContent).toContain("Create your avoro account");
  });

  it("defines a responsive path with a reduced-motion fallback", () => {
    const styles = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");

    expect(styles).toContain(".muse-route__line");
    expect(styles).toMatch(/@media \(max-width: 767px\)[\s\S]*\.muse-route__steps/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.muse-route__line/);
  });

  it("keeps every page surface full-width while capping the process content", () => {
    const styles = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");
    const techPathStyles = styles.match(/\.muse-tech-path \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(techPathStyles).toContain("width: 100%");
    expect(techPathStyles).toContain("max-width: none");
    expect(techPathStyles).toContain("calc((100vw - 1252px) / 2)");
  });

  it("uses one coordinate system for the curve and milestone anchors", async () => {
    const view = await renderPage();
    const route = view.container.querySelector<SVGSVGElement>(".muse-route__line");
    const path = route?.querySelector("path");
    const steps = Array.from(view.container.querySelectorAll<HTMLElement>(".muse-route__step"));
    const anchors = [[22, 72], [51, 50], [72, 28]] as const;

    expect(route?.getAttribute("viewBox")).toBe("0 0 100 100");
    anchors.forEach(([x, y], index) => {
      expect(steps[index]?.style.getPropertyValue("--route-x")).toBe(`${x}%`);
      expect(steps[index]?.style.getPropertyValue("--route-y")).toBe(`${y}%`);
      expect(path?.getAttribute("d")).toContain(`${x} ${y}`);
    });
  });

  it("uses black accents with a paper-white privacy close", () => {
    const styles = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");
    const routeStyles = styles.split("/* How It Works: a single connection thread from search to artist. */")[1]
      ?.split("/* Auth: screenshot-led split composition with a beauty-work visual. */")[0] ?? "";
    const privacyBlock = styles.match(/\.muse-process-privacy \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const markBlock = styles.match(/\.muse-process-privacy__mark \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(routeStyles).toContain("stroke: var(--editorial-ink)");
    expect(routeStyles).toContain("background: var(--editorial-ink)");
    expect(routeStyles).not.toContain("#8b5b72");
    expect(routeStyles).not.toContain("#704659");
    expect(routeStyles).not.toContain("139 91 114");
    expect(routeStyles).not.toContain("#e86f51");
    expect(routeStyles).not.toContain("232 111 81");
    expect(routeStyles).not.toContain("#f1e2dc");
    expect(routeStyles).not.toContain("#e9e0e5");
    expect(privacyBlock).toContain("border-top: 3px solid var(--editorial-ink)");
    expect(privacyBlock).toContain("background: var(--editorial-paper) !important");
    expect(privacyBlock).toContain("color: var(--editorial-ink)");
    expect(markBlock).toContain("border: 1px solid var(--editorial-ink)");
    expect(markBlock).toContain("color: var(--editorial-ink)");
  });
});

async function renderPage(withShell = false) {
  const window = new Window();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousEvent = globalThis.Event;
  const previousHTMLElement = globalThis.HTMLElement;
  Object.assign(globalThis, {
    document: window.document,
    window,
    Event: window.Event,
    HTMLElement: window.HTMLElement
  });

  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const page = createElement(HowItWorksPage);
  await act(async () => root.render(
    createElement(MemoryRouter, undefined, withShell ? createElement(BeautyShell, undefined, page) : createElement(AccountAuthProvider, undefined, page))
  ));

  async function cleanup() {
    try {
      await act(async () => root.unmount());
    } finally {
      window.happyDOM.close();
      Object.assign(globalThis, {
        document: previousDocument,
        window: previousWindow,
        Event: previousEvent,
        HTMLElement: previousHTMLElement
      });
    }
  }

  cleanupCallbacks.push(cleanup);
  return { container };
}

function buttonNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name
  ) ?? null;
}
