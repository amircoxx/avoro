import { Window } from "happy-dom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { changePassword, toast, updateAccount } = vi.hoisted(() => ({
  changePassword: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  updateAccount: vi.fn()
}));

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  changePassword,
  updateAccount
}));

vi.mock("sonner", () => ({ toast }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const initialWindow = new Window();
Object.assign(globalThis, {
  window: initialWindow,
  document: initialWindow.document,
  HTMLElement: initialWindow.HTMLElement,
  Event: initialWindow.Event
});

const { createRoot } = await import("react-dom/client");
const { AccountSettingsModal } = await import("../account-settings-modal");

const user = {
  id: "user-1",
  email: "user@example.com",
  role: "CUSTOMER" as const,
  fullName: "Avery",
  avatarUrl: null
};

describe("AccountSettingsModal password changes", () => {
  afterEach(() => vi.resetAllMocks());

  it("keeps the existing General account form available", async () => {
    const view = await renderSettings();

    expect(inputNamed(view.container, "Full name")).not.toBeNull();
    expect(inputNamed(view.container, "Email address")).not.toBeNull();
    expect(buttonNamed(view.container, "Save changes")).not.toBeNull();
    view.cleanup();
  });

  it("switches to a Password section with password-manager autocomplete fields", async () => {
    const view = await renderSettings();

    await act(async () => buttonNamed(view.container, "Password")?.click());

    expect(inputNamed(view.container, "Current password")?.autocomplete).toBe("current-password");
    expect(inputNamed(view.container, "New password")?.autocomplete).toBe("new-password");
    expect(inputNamed(view.container, "Confirm new password")?.autocomplete).toBe("new-password");
    expect(buttonNamed(view.container, "Change password")).not.toBeNull();
    view.cleanup();
  });

  it("rejects mismatched confirmation without a request", async () => {
    const view = await renderSettings();
    await act(async () => buttonNamed(view.container, "Password")?.click());
    await setField(view.container, "Current password", "current password");
    await setField(view.container, "New password", "new password 12345");
    await setField(view.container, "Confirm new password", "different password");

    await act(async () => {
      view.container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(changePassword).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("New passwords do not match.");
    view.cleanup();
  });

  it("submits and clears a successful password change", async () => {
    changePassword.mockResolvedValue(undefined);
    const view = await renderSettings();
    await act(async () => buttonNamed(view.container, "Password")?.click());
    await setField(view.container, "Current password", "current password");
    await setField(view.container, "New password", "new password 12345");
    await setField(view.container, "Confirm new password", "new password 12345");

    await act(async () => {
      view.container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "current password",
      newPassword: "new password 12345"
    });
    expect(inputNamed(view.container, "Current password")?.value).toBe("");
    expect(inputNamed(view.container, "New password")?.value).toBe("");
    expect(inputNamed(view.container, "Confirm new password")?.value).toBe("");
    expect(toast.success).toHaveBeenCalledWith("Password updated.");
    view.cleanup();
  });
});

async function renderSettings() {
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
    root.render(createElement(AccountSettingsModal, {
      user,
      onClose: vi.fn(),
      onUpdated: vi.fn()
    }));
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
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name
  ) ?? null;
}

function inputNamed(container: HTMLElement, name: string) {
  return Array.from(container.querySelectorAll("label")).find(
    (label) => label.textContent?.includes(name)
  )?.querySelector("input") ?? null;
}

async function setField(container: HTMLElement, name: string, value: string) {
  const input = inputNamed(container, name);
  if (!input) throw new Error(`Expected ${name} input`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      input.ownerDocument.defaultView?.HTMLInputElement.prototype ?? {},
      "value"
    )?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
