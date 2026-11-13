import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTechProfileDirty,
  mediaRoleLabel,
  revokeObjectUrls,
  shouldSaveTechProfile
} from "../tech-profile/editor-state";
import TechProfilePage from "../tech-profile-page";
import { AccountAuthProvider } from "@/context/account-auth-context";

const { getCurrentUser, getOwnTechProfile, saveTechProfile, removeProfileMedia, navigate, toast } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getOwnTechProfile: vi.fn(),
  saveTechProfile: vi.fn(),
  removeProfileMedia: vi.fn(),
  navigate: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() }
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/hooks/router", () => ({
  useRouter: () => ({ push: navigate })
}));

vi.mock("@/hooks/use-unsaved-navigation-blocker", () => ({
  useUnsavedNavigationBlocker: () => undefined
}));

vi.mock("@/components/common/location-autocomplete", () => ({
  default: ({ onSelect }: { onSelect: (location: { label: string; latitude: number; longitude: number }) => void }) =>
    createElement("button", { type: "button", onClick: () => onSelect({ label: "Test City", latitude: 1, longitude: 1 }) }, "Choose test city")
}));

vi.mock("@/services/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/api")>();
  return {
    ...original,
    getOwnTechProfile,
    saveTechProfile,
    initialTechOnboardingForm: { ...original.initialTechOnboardingForm, businessName: "Test profile" },
    getCurrentUser,
    removeProfileMedia,
    uploadProfileMedia: vi.fn()
  };
});


Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TechProfilePage", () => {
  beforeEach(() => {
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH", email: "mia@example.com", fullName: "Mia", avatarUrl: null });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it("keeps the owner save workflow and navigation protection wired", () => {
    const source = readFileSync(new URL("../tech-profile-page.tsx", import.meta.url), "utf8");

    expect(source).toContain("const { authUser: user, isAuthLoading } = useAccountAuth();");
    expect(source).not.toContain("getCurrentUser()");
    expect(source).toMatch(/getOwnTechProfile\(\)/);
    expect(source).toMatch(/await saveTechProfile\(techForm, techLocation\)/);
    expect(source).toMatch(/for \(const mediaId of retryDraft\.removedMediaIds\)/);
    expect(source).toMatch(/for \(const upload of retryDraft\.pendingUploads\)/);
    expect(source).toMatch(/uploadProfileMedia\(upload\.file, upload\.role\)/);
    expect(source).toMatch(/useUnsavedNavigationBlocker/);
  });

  it("keeps services and external booking URLs out of profile payload ownership", () => {
    const profiles = readFileSync(new URL("../../services/api/profiles.ts", import.meta.url), "utf8");
    const payloadBuilder = profiles.slice(profiles.indexOf("export function buildTechProfilePayload"), profiles.indexOf("export function mapOwnerTechProfileToOnboardingState"));

    expect(payloadBuilder).not.toMatch(/bookingUrl|services|serviceName|startingPrice/);
  });

  it("keeps saved editor state clean and detects meaningful draft changes", () => {
    const savedForm = { ...initialForm() };
    const savedLocation = {
      id: "charlotte",
      label: "Charlotte, NC",
      city: "Charlotte",
      state: "NC",
      country: "US",
      lat: 35.2271,
      lng: -80.8431
    };
    const savedDraft = {
      savedMedia: { profileImage: null, backgroundImage: null, galleryImages: [] },
      preview: { profileImage: null, backgroundImage: null, galleryImages: [] },
      pendingUploads: [],
      removedMediaIds: []
    };

    expect(isTechProfileDirty(savedForm, savedLocation, savedDraft, savedForm, savedLocation, savedDraft)).toBe(false);
    expect(isTechProfileDirty({ ...savedForm, bio: "Updated bio" }, savedLocation, savedDraft, savedForm, savedLocation, savedDraft)).toBe(true);
    expect(isTechProfileDirty(savedForm, savedLocation, { ...savedDraft, removedMediaIds: ["gallery-1"] }, savedForm, savedLocation, savedDraft)).toBe(true);
  });

  it("provides save validation and readable media labels through editor-state helpers", () => {
    expect(shouldSaveTechProfile(initialForm())).toBe(false);
    expect(shouldSaveTechProfile({ ...initialForm(), businessName: "Mia Nails" })).toBe(true);
    expect(mediaRoleLabel("gallery")).toBe("portfolio");
    const revokeObjectURL = vi.fn();
    const originalUrl = globalThis.URL;
    Object.defineProperty(globalThis, "URL", { configurable: true, value: { revokeObjectURL } });
    revokeObjectUrls(["blob:first", "blob:second"]);
    Object.defineProperty(globalThis, "URL", { configurable: true, value: originalUrl });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });

  it("renders an existing owner profile as a preview and saves through the details modal", async () => {
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockResolvedValue(existingProfile());
    saveTechProfile.mockResolvedValue(undefined);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("My profile"));
    const editButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='Edit profile']");
    expect(editButton).not.toBeNull();
    expect(view.container.querySelector("form")).toBeNull();

    await act(async () => editButton?.click());
    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
    const closeButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='Close']");
    if (!closeButton || !editButton) throw new Error("Profile editor controls were not rendered");
    await act(async () => closeButton.click());
    expect(document.activeElement).toBe(editButton);
    await act(async () => editButton.click());

    const saveForm = view.container.querySelector<HTMLFormElement>('[role="dialog"] form');
    if (!saveForm) throw new Error("Profile details form was not rendered");
    expect(Array.from(saveForm.querySelectorAll("button")).some((button) => /save profile/i.test(button.textContent ?? ""))).toBe(true);
    await act(async () => saveForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    await waitFor(() => expect(saveTechProfile).toHaveBeenCalledTimes(1));
    view.cleanup();
  });

  it("removes queued preview media after the modal save", async () => {
    const profile = existingProfile();
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockResolvedValue(profile);
    saveTechProfile.mockResolvedValue(undefined);
    removeProfileMedia.mockResolvedValue({ ...profile, galleryImages: [] });
    const view = await renderPage();

    await waitFor(() => expect(view.container.querySelector("button[aria-label='Remove portfolio photo 1']")).not.toBeNull());
    const removeButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='Remove portfolio photo 1']");
    const editButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='Edit profile']");
    if (!removeButton || !editButton) throw new Error("Expected owner profile controls");
    await act(async () => removeButton.click());
    await act(async () => editButton.click());

    const saveForm = view.container.querySelector<HTMLFormElement>('[role="dialog"] form');
    if (!saveForm) throw new Error("Profile details form was not rendered");
    await act(async () => saveForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    await waitFor(() => expect(removeProfileMedia).toHaveBeenCalledWith("gallery-1"));
    view.cleanup();
  });

  it("keeps the profile-loading effect independent of the router wrapper object", () => {
    const source = readFileSync(new URL("../tech-profile-page.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/const navigate = useRouter\(\)\.push/);
    expect(source).toMatch(/\}, \[isAuthLoading, navigate, profileLoadAttempt, user\]\);/);
  });

  it("accepts supported background uploads without imposing a pixel minimum", () => {
    const source = readFileSync(new URL("../tech-profile-page.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("validateBackgroundImageDimensions");
    expect(source).toMatch(/addDraftMedia\(mediaDraft, file, role, objectUrl\)/);
  });

  it("gates techs without a profile until they choose to create one", () => {
    const source = readFileSync(new URL("../tech-profile-page.tsx", import.meta.url), "utf8");
    const emptyState = readFileSync(new URL("../tech-profile/tech-profile-empty-state.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/const \[hasProfile, setHasProfile\] = useState<boolean \| null>\(null\);/);
    expect(source).toMatch(/setHasProfile\(Boolean\(profile\)\);/);
    expect(source).toMatch(/if \(isProfileLoading \|\| hasProfile === null\)/);
    expect(source).toMatch(/if \(hasProfile === false && !isCreatingProfile\)/);
    expect(emptyState).toMatch(/Create your profile to start getting discovered\./);
    expect(source).toMatch(/setIsDetailsModalOpen\(true\)/);
    expect(source).toContain("<TechProfileDetailsModal");
    expect(source).not.toContain("<ProfileMediaEditor");
  });

  it("waits for no-profile resolution, then reveals the editor only after Create profile is selected", async () => {
    const profile = deferred<null>();
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockReturnValue(profile.promise);
    const view = await renderPage();

    expect(view.container.textContent).toContain("Loading profile...");
    expect(view.container.textContent).not.toContain("Edit your profile");

    await act(async () => {
      profile.resolve(null);
      await profile.promise;
    });

    expect(view.container.textContent).toContain("Create your profile to start getting discovered.");
    expect(view.container.textContent).not.toContain("Edit your profile");

    const createButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create profile"
    );
    if (!createButton) throw new Error("Create profile CTA was not rendered");
    act(() => { createButton.click(); });

    expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain("Create your profile to start getting discovered.");
    view.cleanup();
  });

  it("uses shared auth while retaining an effect-local cancellation flag for profile loads", () => {
    const source = readFileSync(new URL("../tech-profile-page.tsx", import.meta.url), "utf8");

    expect(source).toContain("useAccountAuth");
    expect(source).not.toContain("getCurrentUser");
    expect(source).toMatch(/getOwnTechProfile\(\)[\s\S]*if \(!isCurrentRequest\) return;[\s\S]*return \(\) => \{\s*isCurrentRequest = false;/);
  });

  it("shows a load error and retries until a resolved missing profile reveals the create CTA", async () => {
    const retryProfile = deferred<null>();
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockRejectedValueOnce(new Error("Profile service unavailable")).mockReturnValueOnce(retryProfile.promise);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("Profile service unavailable"));
    expect(view.container.textContent).toContain("Retry");
    expect(view.container.textContent).not.toContain("Create your profile to start getting discovered.");

    const retryButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry"
    );
    if (!retryButton) throw new Error("Retry button was not rendered");
    act(() => { retryButton.click(); });

    await act(async () => {
      retryProfile.resolve(null);
      await retryProfile.promise;
    });

    expect(getOwnTechProfile).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain("Create your profile to start getting discovered.");
    view.cleanup();
  });

  it("does not update profile state after an in-flight save unmounts the page", async () => {
    const save = deferred<void>();
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockResolvedValue(null);
    saveTechProfile.mockReturnValue(save.promise);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("Create your profile to start getting discovered."));
    const createButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create profile"
    );
    if (!createButton) throw new Error("Create profile CTA was not rendered");
    act(() => { createButton.click(); });

    const locationButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Choose test city"
    );
    if (!locationButton) throw new Error("Location picker was not rendered");
    act(() => { locationButton.click(); });

    const form = view.container.querySelector("form");
    if (!form) throw new Error("Profile form was not rendered");
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => expect(saveTechProfile).toHaveBeenCalledTimes(1));
    view.cleanup();

    await act(async () => {
      save.resolve();
      await save.promise;
    });

    expect(getOwnTechProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved profile open when its best-effort refresh fails", async () => {
    getCurrentUser.mockResolvedValue({ id: "tech-1", role: "TECH" });
    getOwnTechProfile.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Refresh unavailable"));
    saveTechProfile.mockResolvedValue(undefined);
    const view = await renderPage();

    await waitFor(() => expect(view.container.textContent).toContain("Create your profile to start getting discovered."));
    const createButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create profile"
    );
    if (!createButton) throw new Error("Create profile CTA was not rendered");
    act(() => { createButton.click(); });

    const locationButton = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Choose test city"
    );
    if (!locationButton) throw new Error("Location picker was not rendered");
    act(() => { locationButton.click(); });

    const form = view.container.querySelector("form");
    if (!form) throw new Error("Profile form was not rendered");
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile saved."));
    expect(view.container.querySelector("button[aria-label='Edit profile']")).not.toBeNull();
    expect(view.container.textContent).not.toContain("Create your profile to start getting discovered.");
    expect(toast.error).not.toHaveBeenCalledWith("Refresh unavailable");
    expect(toast.error).not.toHaveBeenCalledWith("Profile could not be saved");
    view.cleanup();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function initialForm() {
  return {
    businessName: "",
    displayName: "",
    bio: "",
    email: "",
    phone: "",
    instagramUrl: "",
    specialties: "",
    referredByCode: "",
    isPublished: false
  };
}

function existingProfile() {
  return {
    id: "tech-1",
    businessName: "My profile",
    displayName: "Mia Chen",
    bio: "Gel-X artist",
    email: "mia@example.com",
    phone: "555-0100",
    bookingEnabled: false,
    instagramUrl: "https://instagram.com/mia",
    specialties: ["Gel-X"],
    averageRating: 0,
    reviewCount: 0,
    publicLocationLabel: "Charlotte, NC",
    city: "Charlotte",
    state: "NC",
    country: "US",
    latitude: 35.2271,
    longitude: -80.8431,
    locationVisibility: "city_only" as const,
    publicRadiusMiles: 5,
    isPublished: true,
    referralCode: "avoro-123",
    profileImage: null,
    backgroundImage: null,
    galleryImages: [{ id: "gallery-1", imageUrl: "https://example.com/gallery.jpg", altText: null, sortOrder: 0 }],
    services: [{ id: "service-1", name: "Gel-X Full Set", description: "Structured extensions", startingPriceCents: 9500, durationMinutes: 60 }],
    reviews: []
  };
}

async function renderPage(options?: { strict?: boolean }) {
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
  const page = createElement(AccountAuthProvider, undefined, createElement(TechProfilePage));
  await act(async () => { root.render(options?.strict ? createElement(StrictMode, undefined, page) : page); });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      window.close();
    }
  };
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 9) throw error;
      await act(async () => { await Promise.resolve(); });
    }
  }
}
