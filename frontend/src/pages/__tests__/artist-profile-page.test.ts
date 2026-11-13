import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../artist-profile-page";
import { AccountAuthProvider } from "@/context/account-auth-context";

const { getCurrentUser, loadArtistProfile, push, toast, messaging } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadArtistProfile: vi.fn(),
  push: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  messaging: { available: true, facade: null, refreshUnread: vi.fn() }
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/hooks/router", () => ({
  useParams: () => ({ id: "tech-1" }),
  useRouter: () => ({ push })
}));

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  getCurrentUser
}));

vi.mock("@/facades/artist-profile.facade", () => ({
  loadArtistProfile,
  submitArtistReview: vi.fn(),
  toggleArtistSavedTech: vi.fn()
}));

vi.mock("@/context/messaging-context", () => ({
  useMessaging: () => messaging
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("ProfilePage", () => {
  afterEach(() => {
    vi.resetAllMocks();
    messaging.available = true;
  });

  it("uses the reference-inspired overview while keeping services and reviews available", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadArtistProfile.mockResolvedValue({ artist: artist(), profile: profile(), isSaved: false });
    const view = await renderPage();

    await waitFor(() => expect(tabNamed(view.container, "Overview")).not.toBeNull());
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".editorial-profile")).not.toBeNull();
    expect(view.container.querySelector(".editorial-profile-identity")).not.toBeNull();
    expect(view.container.querySelector(".editorial-profile-identity__content")).not.toBeNull();
    expect(view.container.querySelector(".editorial-profile-layout")).not.toBeNull();
    expect(view.container.querySelector(".editorial-profile-portrait")).not.toBeNull();
    expect(view.container.querySelector(".editorial-profile-booking")).not.toBeNull();
    expect(view.container.querySelector(".editorial-tabs")).not.toBeNull();
    expect(view.container.textContent).toContain("Profile insights");
    expect(view.container.textContent).toContain("Local specialist");
    expect(view.container.textContent).toContain("Experience");
    expect(view.container.textContent).toContain("Starting at");
    expect(view.container.textContent).toContain("Structured extensions");
    expect(view.container.querySelector("[aria-label='Portfolio photos']")?.className).toContain("editorial-portfolio-rail");
    expect(view.container.querySelector("button[aria-label='View portfolio photo 1']")).not.toBeNull();
    const services = tabNamed(view.container, "Services & Pricing");
    const reviews = tabNamed(view.container, "Reviews (0)");
    expect(services).not.toBeNull();
    expect(reviews).not.toBeNull();

    await act(async () => services?.click());
    expect(view.container.textContent).toContain("This tech has not listed services yet.");

    await act(async () => reviews?.click());
    expect(buttonNamed(view.container, "Submit review")).not.toBeNull();
    view.cleanup();
  });

  it("routes both enabled booking actions internally", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadArtistProfile.mockResolvedValue({ artist: artist(), profile: profile(true), isSaved: false });
    const view = await renderPage();
    await waitFor(() => expect(buttonsNamed(view.container, "Book now")).toHaveLength(2));

    await act(async () => buttonsNamed(view.container, "Book now")[0]?.click());
    await act(async () => buttonsNamed(view.container, "Book now")[1]?.click());

    expect(push).toHaveBeenNthCalledWith(1, "/artists/tech-1/book");
    expect(push).toHaveBeenNthCalledWith(2, "/artists/tech-1/book");
    view.cleanup();
  });

  it("disables both booking actions when direct booking is unavailable", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadArtistProfile.mockResolvedValue({ artist: artist(), profile: profile(false), isSaved: false });
    const view = await renderPage();
    await waitFor(() => expect(buttonsNamed(view.container, "Booking unavailable")).toHaveLength(2));

    expect(buttonsNamed(view.container, "Booking unavailable").every((button) => button.disabled)).toBe(true);
    expect(view.container.textContent).toContain("contact methods");
    view.cleanup();
  });

  it("offers a message request beside booking when messaging is available", async () => {
    getCurrentUser.mockResolvedValue(null);
    loadArtistProfile.mockResolvedValue({ artist: artist(), profile: profile(true), isSaved: false });
    const view = await renderPage();

    await waitFor(() => expect(buttonNamed(view.container, "Message this tech")).not.toBeNull());

    view.cleanup();
  });

  it("hides the message request when the server capability is unavailable", async () => {
    messaging.available = false;
    getCurrentUser.mockResolvedValue(null);
    loadArtistProfile.mockResolvedValue({ artist: artist(), profile: profile(true), isSaved: false });
    const view = await renderPage();

    await waitFor(() => expect(buttonsNamed(view.container, "Book now")).toHaveLength(2));
    expect(buttonNamed(view.container, "Message this tech")).toBeNull();
    view.cleanup();
  });
});

function artist() {
  return {
    id: 1,
    backendId: "tech-1",
    name: "Mia Chen",
    handle: "@mia",
    specialty: "Gel-X",
    location: "Charlotte, NC",
    distance: "2 mi",
    rating: 5,
    reviewCount: 0,
    priceLabel: "From $95",
    priceMin: 95,
    tags: ["Gel-X"],
    bio: "Structured extensions",
    photo: "",
    cover: "",
    gallery: ["https://example.com/work-1.jpg", "https://example.com/work-2.jpg"],
    services: [],
    reviews: []
  };
}

function profile(bookingEnabled = false) {
  return {
    id: "tech-1",
    businessName: "Mia Chen",
    displayName: "Mia Chen",
    bio: "Structured extensions",
    phone: null,
    email: null,
    instagramUrl: null,
    bookingEnabled,
    specialties: ["Gel-X"],
    averageRating: 5,
    reviewCount: 0,
    publicLocationLabel: "Charlotte, NC",
    profileImage: null,
    backgroundImage: null,
    galleryImages: [
      { id: "work-1", imageUrl: "https://example.com/work-1.jpg", altText: null, sortOrder: 0 },
      { id: "work-2", imageUrl: "https://example.com/work-2.jpg", altText: null, sortOrder: 1 }
    ],
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
  await act(async () => { root.render(createElement(AccountAuthProvider, undefined, createElement(ProfilePage))); });
  return { container, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function buttonNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === name) ?? null;
}

function buttonsNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.textContent?.trim() === name);
}

function tabNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll<HTMLElement>("[role='tab']")).find((tab) => tab.textContent?.trim() === name) ?? null;
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 9) throw error;
      await act(async () => { await Promise.resolve(); });
    }
  }
}
