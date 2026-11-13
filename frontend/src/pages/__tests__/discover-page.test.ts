import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DiscoverPage from "../discover-page";
import { parseTypedLocation } from "../discover/discover-location";
import { AccountAuthProvider } from "@/context/account-auth-context";

const { getCurrentUser, loadSavedTechIds, loadFeaturedArtists, searchArtists, push, toast } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadSavedTechIds: vi.fn(),
  loadFeaturedArtists: vi.fn(),
  searchArtists: vi.fn(),
  push: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() }
}));

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  getCurrentUser
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/hooks/router", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
vi.mock("@/components/common/location-autocomplete", () => ({
  default: ({ placeholder, ariaLabel }: { placeholder: string; ariaLabel?: string }) => createElement("input", { placeholder, "aria-label": ariaLabel })
}));
vi.mock("@/facades/discover.facade", () => ({
  loadSavedTechIds,
  loadFeaturedArtists,
  searchArtists,
  toggleSavedTech: vi.fn()
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DiscoverPage", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("looks up browser coordinates and renders artists from the resolved city", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([]);
    searchArtists.mockResolvedValue([artist("Nearby artist", 55, "nearby")]);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: "atlanta", label: "Atlanta, GA", city: "Atlanta", state: "GA", country: "US", lat: 33.749, lng: -84.388 } }));
    vi.stubGlobal("fetch", fetchMock);
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 33.749, longitude: -84.388 } }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const view = await renderPage();
    try {
      expect(getCurrentPosition).not.toHaveBeenCalled();
      await act(async () => buttonWithLabel(view.container, "Use my location")?.click());
      await waitFor(() => expect(view.container.textContent).toContain("Nearby artist"));
      expect(fetchMock).toHaveBeenCalledWith("/api/locations/coords?lat=33.749&lng=-84.388");
      expect(searchArtists).toHaveBeenCalledWith({ city: "Atlanta", state: "GA", country: "US" });
    } finally { view.cleanup(); }
  });

  it.each(["empty", "provider", "denied", "unsupported"])("shows feedback for %s location failures", async (failure) => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(failure === "provider"
      ? Response.json({ error: { message: "Location lookup failed" } }, { status: 502 })
      : Response.json({ data: null }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", failure === "unsupported" ? {} : { geolocation: { getCurrentPosition: (success: (value: unknown) => void, error: () => void) => {
      if (failure === "denied") error();
      else success({ coords: { latitude: 0, longitude: 0 } });
    } } });
    const view = await renderPage();
    try {
      await act(async () => buttonWithLabel(view.container, "Use my location")?.click());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(failure === "empty" ? "Unable to determine your current city." : failure === "provider" ? "Location lookup failed" : "Unable to fetch your current location."));
      expect(searchArtists).not.toHaveBeenCalled();
      if (failure === "denied" || failure === "unsupported") expect(fetchMock).not.toHaveBeenCalled();
    } finally { view.cleanup(); }
  });

  it("shows the saved control state for a saved featured tech", async () => {
    getCurrentUser.mockResolvedValue({ id: "customer-1", role: "CUSTOMER", email: "customer@example.com", fullName: "Avery", avatarUrl: null });
    loadSavedTechIds.mockResolvedValue(new Set(["tech-1"]));
    loadFeaturedArtists.mockResolvedValue([artist("saved", 55, "tech-1")]);
    const view = await renderPage();

    await waitFor(() => expect(buttonWithLabel(view.container, "Unsave")).not.toBeNull());
    expect(buttonWithLabel(view.container, "Save")).toBeNull();
    view.cleanup();
  });

  it("waits for shared authentication before loading saved-tech state", async () => {
    const session = deferred<{ id: string; role: "CUSTOMER"; email: string; fullName: string | null; avatarUrl: string | null }>();
    getCurrentUser.mockReturnValue(session.promise);
    loadSavedTechIds.mockResolvedValue(new Set(["tech-1"]));
    loadFeaturedArtists.mockResolvedValue([artist("saved", 55, "tech-1")]);
    const view = await renderPage();

    expect(loadSavedTechIds).not.toHaveBeenCalled();
    await act(async () => {
      session.resolve({ id: "customer-1", role: "CUSTOMER", email: "customer@example.com", fullName: "Avery", avatarUrl: null });
      await session.promise;
    });
    await waitFor(() => expect(loadSavedTechIds).toHaveBeenCalledWith(expect.objectContaining({ id: "customer-1", role: "CUSTOMER" })));
    expect(buttonWithLabel(view.container, "Unsave")).not.toBeNull();
    view.cleanup();
  });

  it("keeps every selected price range in the rendered results", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([
      artist("under", 55, "tech-under"),
      artist("middle", 85, "tech-middle"),
      artist("hundred", 120, "tech-hundred"),
      artist("premium", 175, "tech-premium")
    ]);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("under"));
    await act(async () => buttonWithLabel(view.container, "Open price filters")?.click());
    await act(async () => buttonWithText(view.container, "Under $60")?.click());
    await act(async () => buttonWithText(view.container, "$100 – $150")?.click());
    await act(async () => buttonWithText(view.container, "Apply filters")?.click());

    expect(view.container.textContent).toContain("under");
    expect(view.container.textContent).toContain("hundred");
    expect(view.container.textContent).not.toContain("middle");
    expect(view.container.textContent).not.toContain("premium");
    view.cleanup();
  });

  it("renders price filter controls and parses a typed city for search", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([artist("saved", 55, "tech-1")]);
    const view = await renderPage();

    expect(parseTypedLocation(" Boston, MA ")).toEqual({ city: "Boston", state: "MA", country: "US" });
    expect(view.container.querySelector(".editorial-discover")).not.toBeNull();
    expect(view.container.querySelector('input[aria-label="Search services or artists"]')).not.toBeNull();
    expect(view.container.querySelector('input[aria-label="Search by city"]')).not.toBeNull();
    expect(buttonWithLabel(view.container, "Search artists")).not.toBeNull();
    view.cleanup();
  });

  it("centers one unified search hero before featured cards", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([artist("featured", 55, "tech-1")]);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("featured"));

    const hero = view.container.querySelector(".editorial-discover-hero");
    const search = hero?.querySelector(".editorial-discover-search");
    const results = view.container.querySelector(".editorial-discover-layout");
    const cardGrid = results?.querySelector(".grid");

    expect(hero?.querySelector("h1")?.textContent).toBe("Find your artist.");
    expect(search?.querySelector('input[aria-label="Search services or artists"]')).not.toBeNull();
    expect(search?.querySelector('input[aria-label="Search by city"]')).not.toBeNull();
    expect(search?.querySelector('button[aria-label="Search artists"]')).not.toBeNull();
    expect(hero?.nextElementSibling).toBe(results);
    expect(cardGrid?.classList.contains("editorial-results__grid")).toBe(true);
    expect(cardGrid?.classList.contains("xl:grid-cols-4")).toBe(false);
    expect(view.container.textContent).not.toContain("Featured on avoro");
    expect(view.container.textContent).not.toContain("Most-reviewed techs");
    expect(view.container.textContent).not.toContain("featured tech");
    view.cleanup();
  });

  it("opens price filters from the circular trigger and reports applied filters", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadFeaturedArtists.mockResolvedValue([artist("saved", 55, "tech-1")]);
    const view = await renderPage();

    await act(async () => buttonWithLabel(view.container, "Open price filters")?.click());
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => buttonWithText(view.container, "Under $60")?.click());
    await act(async () => buttonWithText(view.container, "$100 – $150")?.click());
    await act(async () => buttonWithText(view.container, "Apply filters")?.click());

    expect(buttonWithLabel(view.container, "Open price filters, 2 active")).not.toBeNull();
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.cleanup();
  });
});

function artist(name: string, priceMin: number, backendId: string) {
  return {
    id: priceMin,
    backendId,
    name,
    handle: `@${name}`,
    specialty: "Gel-X",
    location: "Charlotte, NC",
    distance: "2 mi",
    rating: 5,
    reviewCount: 1,
    priceLabel: `From $${priceMin}`,
    priceMin,
    tags: ["Gel-X"],
    bio: "Bio",
    photo: "",
    cover: "",
    gallery: [],
    services: [],
    reviews: []
  };
}

async function renderPage() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => { root.render(createElement(AccountAuthProvider, undefined, createElement(DiscoverPage))); });
  return { container, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function buttonWithLabel(container: HTMLElement, label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
}

function buttonWithText(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === label) ?? null;
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 9) throw error;
      await act(async () => { await Promise.resolve(); });
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
