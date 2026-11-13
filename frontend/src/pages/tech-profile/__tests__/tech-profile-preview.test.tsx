// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TechProfilePreview } from "../tech-profile-preview";
import type { LocationSuggestion, TechOnboardingForm, TechProfileMedia } from "@/services/api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const form: TechOnboardingForm = {
  businessName: "Gloss Room",
  displayName: "Mia Chen",
  bio: "Detailed Gel-X sets and hand-painted nail art for every occasion.",
  email: "mia@example.com",
  phone: "555-0100",
  instagramUrl: "https://instagram.com/glossroom",
  specialties: "Gel-X, nail art, structured manicures",
  isPublished: true,
  referredByCode: ""
};

const location: LocationSuggestion = {
  id: "charlotte-nc",
  label: "Charlotte, NC",
  city: "Charlotte",
  state: "NC",
  country: "US",
  lat: 35.2271,
  lng: -80.8431
};

const draftMedia: TechProfileMedia = {
  backgroundImage: { id: "background-draft", imageUrl: "blob:background-draft", altText: null, sortOrder: 0 },
  profileImage: { id: "profile-draft", imageUrl: "blob:profile-draft", altText: null, sortOrder: 0 },
  galleryImages: [
    { id: "gallery-second", imageUrl: "blob:gallery-second", altText: null, sortOrder: 2 },
    { id: "gallery-draft", imageUrl: "blob:gallery-draft", altText: null, sortOrder: 1 }
  ]
};

describe("TechProfilePreview", () => {
  it("renders only directly managed profile media and compact owner actions", () => {
    const markup = renderToStaticMarkup(
      <TechProfilePreview
        form={form}
        location={location}
        media={draftMedia}
        rating={4.9}
        reviewCount={38}
        referralCode="avoro-123"
        editing={{ disabled: false, onAdd: vi.fn(), onRemove: vi.fn(), onEditDetails: vi.fn() }}
      />
    );

    expect(markup).toContain('src="blob:background-draft"');
    expect(markup).toContain("editorial-profile-preview");
    expect(markup).toContain("editorial-profile-minimal");
    expect(markup).toContain("editorial-profile-cover");
    expect(markup).toContain("editorial-profile-portrait");
    expect(markup).toContain('src="blob:profile-draft"');
    expect(markup).toContain('src="blob:gallery-draft"');
    expect(markup).toContain("Portfolio");
    expect(markup).toContain("editorial-profile-minimal__gallery");
    expect(markup).toContain("editorial-profile-minimal__gallery-card");
    expect(markup).toContain("Referral code");
    expect(markup).toContain("Copy referral code");
    expect(markup).toContain('aria-label="Profile owner actions"');
    expect(markup).not.toContain("Profile insights");
    expect(markup).not.toContain("Experience");
    expect(markup).not.toContain("Services &amp; Pricing");
    expect(markup).not.toContain("Reviews (38)");
    expect(markup).not.toContain("Price range");
    expect(markup).not.toContain("Service area");
    expect(markup.indexOf("blob:gallery-draft")).toBeLessThan(markup.indexOf("blob:gallery-second"));
    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Copy referral code");
  });

  it("renders editable media controls and forwards selected and removed media", async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const view = await renderPreview({ editing: { disabled: false, onAdd, onRemove, onEditDetails: vi.fn() } });
    const profileInput = view.container.querySelector<HTMLInputElement>("input[aria-label='Choose profile picture']");
    const removalButton = view.container.querySelector<HTMLButtonElement>("button[aria-label='Remove portfolio photo 1']");

    expect(view.container.querySelector("button[aria-label='Change profile picture']")).not.toBeNull();
    expect(view.container.querySelector("button[aria-label='Change background image']")).not.toBeNull();
    expect(view.container.querySelector("button[aria-label='Change profile picture']")?.className).toContain("-bottom-2");
    expect(view.container.querySelector("button[aria-label='Change profile picture']")?.className).toContain("-right-2");
    expect(view.container.querySelector("img[alt='Gloss Room']")?.parentElement?.parentElement?.className).not.toContain("-mt-20");
    expect(view.container.querySelector("button[aria-label='Change background image']")?.className).toContain("bottom-4");
    expect(view.container.querySelector("button[aria-label='Change background image']")?.className).toContain("right-4");
    expect(view.container.querySelector("button[aria-label='Add portfolio photo']")).not.toBeNull();
    expect(removalButton).not.toBeNull();
    expect(profileInput).not.toBeNull();

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    if (!profileInput || !removalButton) throw new Error("Expected editable preview controls");
    Object.defineProperties(profileInput, {
      files: { configurable: true, value: [file] },
      value: { configurable: true, value: "avatar.png", writable: true }
    });
    await act(async () => profileInput.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => removalButton.click());

    expect(onAdd).toHaveBeenCalledWith(file, "profile");
    expect(onRemove).toHaveBeenCalledWith("gallery-draft");
    const galleryTiles = Array.from(view.container.querySelectorAll("img[alt^='Portfolio']"));
    const galleryAddButton = view.container.querySelector("button[aria-label='Add portfolio photo']");
    expect(galleryTiles.at(-1)?.compareDocumentPosition(galleryAddButton!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    view.cleanup();
  });

  it("opens a larger portfolio photo and closes it with Escape", async () => {
    const view = await renderPreview({ editing: { disabled: false, onAdd: vi.fn(), onRemove: vi.fn(), onEditDetails: vi.fn() } });
    const rail = view.container.querySelector("[aria-label='Portfolio photos']");
    const firstPhoto = view.container.querySelector<HTMLButtonElement>("button[aria-label='View portfolio photo 1']");

    expect(rail?.className).toContain("editorial-portfolio-rail");
    expect(firstPhoto).not.toBeNull();
    if (!firstPhoto) throw new Error("Expected a portfolio photo trigger");

    await act(async () => firstPhoto.click());
    expect(document.querySelector("[role='dialog'][aria-label='Portfolio photo viewer']")).not.toBeNull();
    expect(document.querySelector("img[alt='Portfolio 1, enlarged']")).not.toBeNull();

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector("[role='dialog'][aria-label='Portfolio photo viewer']")).toBeNull();
    view.cleanup();
  });

  it("shows customer actions only outside the owner profile editor", async () => {
    const customerMarkup = renderToStaticMarkup(
      <TechProfilePreview form={form} location={location} media={draftMedia} rating={4.9} reviewCount={38} referralCode="avoro-123" />
    );
    const ownerView = await renderPreview({ editing: { disabled: false, onAdd: vi.fn(), onRemove: vi.fn(), onEditDetails: vi.fn() } });

    expect(customerMarkup).toContain("Book now");
    expect(customerMarkup).toContain('aria-label="Save profile"');
    expect(customerMarkup).toContain("rounded-full");
    expect(ownerView.container.textContent).not.toContain("Book now");
    expect(ownerView.container.querySelector("button[aria-label='Save profile']")).toBeNull();
    ownerView.cleanup();
  });

  it("does not render a gallery add control at the twelve-image limit", async () => {
    const media: TechProfileMedia = {
      profileImage: null,
      backgroundImage: null,
      galleryImages: Array.from({ length: 12 }, (_, index) => ({
        id: `gallery-${index}`,
        imageUrl: `blob:gallery-${index}`,
        altText: null,
        sortOrder: index
      }))
    };
    const view = await renderPreview({ media, editing: { disabled: false, onAdd: vi.fn(), onRemove: vi.fn(), onEditDetails: vi.fn() } });

    expect(view.container.querySelector("button[aria-label='Add portfolio photo']")).toBeNull();
    view.cleanup();
  });

  it("disables every editable media control while saving", async () => {
    const view = await renderPreview({ editing: { disabled: true, onAdd: vi.fn(), onRemove: vi.fn(), onEditDetails: vi.fn() } });
    const controls = Array.from(view.container.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input[aria-label^='Choose'], button[aria-label='Change profile picture'], button[aria-label='Change background image'], button[aria-label='Add portfolio photo'], button[aria-label^='Remove portfolio photo']"
    ));

    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled)).toBe(true);
    view.cleanup();
  });
});

async function renderPreview({
  media = draftMedia,
  editing
}: Partial<{
  media: TechProfileMedia;
  editing: {
    disabled: boolean;
    onAdd: ReturnType<typeof vi.fn>;
    onRemove: ReturnType<typeof vi.fn>;
    onEditDetails: ReturnType<typeof vi.fn>;
  };
}> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(<TechProfilePreview form={form} location={location} media={media} rating={4.9} reviewCount={38} referralCode="avoro-123" editing={editing} />);
  });

  return {
    container,
    cleanup: () => act(() => root.unmount())
  };
}
