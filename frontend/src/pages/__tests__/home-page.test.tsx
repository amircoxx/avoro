import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "../home-page";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
const cleanupCallbacks: Array<() => Promise<void>> = [];

vi.mock("@/hooks/router", () => ({
  useRouter: () => ({ push: navigate })
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("LandingPage", () => {
  afterEach(async () => {
    try {
      for (const cleanup of cleanupCallbacks.splice(0)) {
        await cleanup();
      }
    } finally {
      vi.resetAllMocks();
    }
  });

  it("renders no demo profiles and routes the discovery CTA to Discover", async () => {
    const view = await renderPage();

    expect(view.container.textContent).not.toContain("Mia Chen");
    expect(view.container.textContent).not.toContain("Jasmine Wade");
    expect(view.container.textContent).not.toContain("Destiny Lewis");

    const discoverButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Discover all artists"
    );
    if (!discoverButton) throw new Error("Discover all artists CTA was not rendered");

    await act(async () => discoverButton.click());
    expect(navigate).toHaveBeenCalledWith("/discover");
  });

  it("renders the editorial marketplace without invented traction", async () => {
    const view = await renderPage();

    expect(view.container.textContent).toContain("Your next beauty artist is closer than you think.");
    expect(view.container.textContent).toContain("02");
    expect(view.container.textContent).toContain("00");
    expect(view.container.textContent).not.toMatch(/clients coached|years experience|Mia Chen/i);
    expect(view.container.textContent).not.toContain("Details make the difference.");
    expect(view.container.textContent).not.toContain("The beauty edit");
    expect(view.container.querySelectorAll("img[alt]")).toHaveLength(1);
  });

  it("opens a service disclosure accessibly", async () => {
    const view = await renderPage();
    const button = view.container.querySelector<HTMLButtonElement>('button[aria-controls="service-panel-nails"]');

    expect(button?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => button?.click());
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(view.container.textContent).toContain("Gel sets, acrylics, extensions, and nail art");
  });

  it("removes landing search controls and routes the hero CTA directly to discovery", async () => {
    const view = await renderPage();
    const heroCta = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Find a tech"
    );

    expect(view.container.querySelector('input[aria-label="Service"]')).toBeNull();
    expect(view.container.querySelector('input[aria-label="City or service area"]')).toBeNull();
    expect(view.container.textContent).not.toContain("Search artists");
    if (!heroCta) throw new Error("Find a tech CTA was not rendered as a button");

    await act(async () => heroCta.click());
    expect(navigate).toHaveBeenCalledWith("/discover");
  });

  it("keeps the dark landing surfaces full-bleed on wide screens", () => {
    const stylesheet = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");
    const heroStyles = stylesheet.match(/\.editorial-hero \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const proofStyles = stylesheet.match(/\.editorial-proof \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(heroStyles).toContain("width: 100%");
    expect(heroStyles).toContain("max-width: none");
    expect(proofStyles).toContain("width: 100%");
    expect(proofStyles).toContain("max-width: none");
  });

  it("uses full-width homepage sections with capped editorial content gutters", () => {
    const stylesheet = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");
    const sectionGroup = stylesheet.match(/\.editorial-offerings,([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(sectionGroup).toContain("width: 100%");
    expect(sectionGroup).toContain("max-width: none");
    for (const className of ["editorial-proof", "editorial-offerings", "editorial-benefits", "editorial-process", "editorial-privacy", "editorial-faq"]) {
      const styles = stylesheet.match(new RegExp(`\\.${className} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      expect(styles).toContain("var(--editorial-content-gutter)");
    }
    const ctaStyleBlocks = Array.from(stylesheet.matchAll(/\.editorial-tech-cta \{([\s\S]*?)\n\}/g), (match) => match[1] ?? "");
    expect(ctaStyleBlocks.some((styles) => styles.includes("var(--editorial-wide-gutter)"))).toBe(true);
  });

  it("presents a complete conversion path without fabricated social proof", async () => {
    const view = await renderPage();

    expect(view.container.textContent).toContain("Portfolio-first profiles");
    expect(view.container.textContent).toContain("Search. Compare. Connect.");
    expect(view.container.textContent).toContain("Why customers choose avoro");
    expect(view.container.querySelectorAll(".editorial-benefit")).toHaveLength(4);
    expect(view.container.querySelectorAll(".editorial-step")).toHaveLength(3);
    expect(view.container.textContent).not.toMatch(/five stars|10,000|trusted by|happy customers/i);
  });

  it("opens landing FAQs accessibly and closes the previously open answer", async () => {
    const view = await renderPage();
    const questions = Array.from(view.container.querySelectorAll<HTMLButtonElement>(".editorial-faq__question"));

    expect(questions).toHaveLength(4);
    expect(questions[0]?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => questions[0]?.click());
    expect(questions[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(view.container.textContent).toContain("Search by service and location");

    await act(async () => questions[1]?.click());
    expect(questions[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(questions[1]?.getAttribute("aria-expanded")).toBe("true");
  });

  it("routes the final customer call to action to discovery", async () => {
    const view = await renderPage();
    const finalCta = view.container.querySelector<HTMLButtonElement>('button[data-landing-cta="discover"]');

    expect(finalCta?.textContent).toContain("Find my artist");
    await act(async () => finalCta?.click());
    expect(navigate).toHaveBeenCalledWith("/discover");
  });

  it("opens profile creation over the landing page without navigating", async () => {
    const view = await renderPage();
    const techCta = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("I’m a beauty tech")
    );
    if (!techCta) throw new Error("Beauty tech CTA was not rendered");

    await act(async () => techCta.click());
    expect(view.container.textContent).toContain("Create a tech account");
    expect(view.container.textContent).toContain("Create your free profile");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("changes the beauty tech call to action color on hover", () => {
    const stylesheet = readFileSync(new URL("../../assets/globals.css", import.meta.url), "utf8");

    expect(stylesheet).toMatch(
      /\.editorial-text-link--light:hover\s*{[^}]*color:\s*var\(--editorial-stone\);/s
    );
  });
});

async function renderPage() {
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
  await act(async () => root.render(createElement(LandingPage)));

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

  return {
    container,
    cleanup
  };
}
