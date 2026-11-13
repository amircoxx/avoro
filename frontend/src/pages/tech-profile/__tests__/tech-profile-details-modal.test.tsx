import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TechProfileDetailsModal } from "../tech-profile-details-modal";
import type { LocationSuggestion, TechOnboardingForm } from "@/services/api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const form: TechOnboardingForm = {
  businessName: "Gloss Room",
  displayName: "Mia Chen",
  bio: "Detailed Gel-X sets and hand-painted nail art.",
  email: "mia@example.com",
  phone: "555-0100",
  instagramUrl: "https://instagram.com/glossroom",
  specialties: "Gel-X, nail art",
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

describe("TechProfileDetailsModal", () => {
  it("does not render legacy booking URL or featured-service controls", async () => {
    const view = await renderModal();

    expect(view.container.textContent).not.toMatch(/booking url|featured service|starting price/i);
    view.cleanup();
  });

  it("renders an accessible dialog and forwards controlled business-name changes", async () => {
    const onChange = vi.fn();
    const view = await renderModal({ onChange });

    expect(view.container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(view.container.querySelector("#tech-profile-details-title")?.textContent).toContain("Edit profile");

    const businessName = view.container.querySelector<HTMLInputElement>('input[aria-label="Business name"]');
    if (!businessName) throw new Error("Business-name field was not rendered");
    businessName.value = "New Gloss Room";
    await act(async () => businessName.dispatchEvent(new view.window.Event("input", { bubbles: true }) as unknown as Event));

    expect(onChange).toHaveBeenCalledWith({ ...form, businessName: "New Gloss Room" });
    view.cleanup();
  });

  it("closes from Escape, Cancel, and the close icon", async () => {
    const onClose = vi.fn();
    const view = await renderModal({ onClose });
    const cancel = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Cancel");
    const closeIcon = view.container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    if (!cancel || !closeIcon) throw new Error("Close controls were not rendered");

    await act(async () => view.window.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => cancel.click());
    await act(async () => closeIcon.click());

    expect(onClose).toHaveBeenCalledTimes(3);
    view.cleanup();
  });

  it("keeps typing focus when the parent supplies a new close callback", async () => {
    const latestClose = vi.fn();
    const onChange = vi.fn((next: TechOnboardingForm) => {
      view.rerender(next, () => latestClose());
    });
    const view = await renderModal({ onChange });
    try {
      expect(view.window.document.activeElement?.id).toBe("tech-profile-details-title");
      const input = view.container.querySelector<HTMLInputElement>('input[aria-label="Business name"]')!;
      input.focus();
      for (const character of " Studio") {
        input.value += character;
        await act(async () => input.dispatchEvent(new view.window.Event("input", { bubbles: true }) as unknown as Event));
        expect(view.window.document.activeElement).toBe(input);
      }
      expect(input.value).toBe("Gloss Room Studio");
      await act(async () => view.window.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Escape" })));
      expect(latestClose).toHaveBeenCalledTimes(1);
    } finally {
      view.cleanup();
    }
  });

  it("submits through the shared save handler", async () => {
    const onSave = vi.fn();
    const view = await renderModal({ onSave });
    const formElement = view.container.querySelector("form");
    if (!formElement) throw new Error("Profile details form was not rendered");

    await act(async () => formElement.dispatchEvent(new view.window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event));

    expect(onSave).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  it("disables every dialog control while saving", async () => {
    const view = await renderModal({ isSaving: true });
    const controls = Array.from(view.container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input, textarea, button"));

    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled || control.closest("fieldset")?.disabled)).toBe(true);
    view.cleanup();
  });
});

async function renderModal({
  form: nextForm = form,
  location: nextLocation = location,
  isSaving = false,
  onChange = vi.fn(),
  onLocationChange = vi.fn(),
  onClose = vi.fn(),
  onSave = vi.fn()
}: Partial<{
  form: TechOnboardingForm;
  location: LocationSuggestion | null;
  isSaving: boolean;
  onChange: ReturnType<typeof vi.fn>;
  onLocationChange: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
}> = {}) {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true
  });
  const document = window.document as unknown as Document;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(<TechProfileDetailsModal form={nextForm} location={nextLocation} isSaving={isSaving} onChange={onChange} onLocationChange={onLocationChange} onClose={onClose} onSave={onSave} />);
  });

  return {
    container,
    window,
    rerender: (updatedForm: TechOnboardingForm, updatedClose: () => void) => {
      root.render(<TechProfileDetailsModal form={updatedForm} location={nextLocation} isSaving={isSaving} onChange={onChange} onLocationChange={onLocationChange} onClose={updatedClose} onSave={onSave} />);
    },
    cleanup: () => {
      act(() => root.unmount());
      window.close();
    }
  };
}
