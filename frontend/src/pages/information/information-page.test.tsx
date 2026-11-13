import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "../../components/layout/site-footer";
import { AppRoutes } from "../../routes/app-routes";
import { informationPages } from "./information-data";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function render(path: string) {
  const window = new Window({ url: `http://localhost:3000${path}` });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><AppRoutes /><SiteFooter /></MemoryRouter>));
  cleanups.push(async () => {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    Object.assign(globalThis, previous);
  });
  return container;
}

describe("Public footer pages", () => {
  it.each(informationPages)("opens $path directly without an account provider", async (page) => {
    const container = await render(page.path);
    expect(container.querySelector("h1")?.textContent).toBe(page.title);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const contents = container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="On this page"] a');
    expect(contents.length).toBeGreaterThanOrEqual(3);
    for (const link of contents) {
      expect(container.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
    expect(container.querySelector(".information-action")?.getAttribute("href")).toBe(page.action.to);
  });

  it.each(informationPages)("navigates to $label through the footer", async (page) => {
    const container = await render("/contact");
    const link = Array.from(container.querySelectorAll<HTMLAnchorElement>("footer a")).find((item) => item.textContent === page.label);
    expect(link).toBeDefined();
    await act(async () => link!.click());
    expect(container.querySelector("h1")?.textContent).toBe(page.title);
  });

  it.each(["/privacy", "/terms", "/cookies"])("keeps the policy review notice visible on %s", async (path) => {
    const container = await render(path);
    expect(container.querySelector('[role="note"]')?.textContent).toContain("Draft for review");
  });

  it("preserves existing navigation and exposes an email action instead of a fake form", async () => {
    const container = await render("/contact");
    const footerPaths = Array.from(container.querySelectorAll("footer a")).map((link) => link.getAttribute("href"));
    expect(footerPaths).toEqual(expect.arrayContaining(["/discover", "/how-it-works", "/for-techs", "/pricing"]));
    expect(container.querySelector("footer button")).toBeNull();
    expect(container.querySelector(".information-action")?.getAttribute("href")).toBe("mailto:hello@avoro.app");
    expect(container.querySelector("form")).toBeNull();
  });
});
