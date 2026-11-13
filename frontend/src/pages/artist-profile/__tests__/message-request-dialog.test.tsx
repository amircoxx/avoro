import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, type CreateMessageRequestInput, type CreateMessageRequestResult } from "@/services/api";
import { MessageRequestDialog } from "../message-request-dialog";

const { push, openAccountAuth, createMessageRequest, refreshUnread, auth, messaging } = vi.hoisted(() => ({
  push: vi.fn(),
  openAccountAuth: vi.fn(),
  createMessageRequest: vi.fn(),
  refreshUnread: vi.fn(),
  auth: { authUser: null as { id: string; role: "CUSTOMER" | "TECH" | "ADMIN" } | null },
  messaging: {
    facade: null as { createMessageRequest: (input: CreateMessageRequestInput) => Promise<CreateMessageRequestResult> } | null,
    refreshUnread: null as (() => Promise<void>) | null
  }
}));

vi.mock("@/hooks/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/account-auth-context", () => ({
  useAccountAuth: () => ({ authUser: auth.authUser, openAccountAuth })
}));
vi.mock("@/context/messaging-context", () => ({
  useMessaging: () => messaging
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MessageRequestDialog", () => {
  beforeEach(() => {
    messaging.facade = { createMessageRequest };
    messaging.refreshUnread = refreshUnread;
  });

  afterEach(() => {
    vi.resetAllMocks();
    auth.authUser = null;
  });

  it("keeps an unauthenticated visitor's draft while opening login", async () => {
    const view = await renderDialog();
    await enterDraft(view.container, "Do you work with color-treated hair?");

    await act(async () => buttonNamed(view.container, "Log in to send")?.click());

    expect(openAccountAuth).toHaveBeenCalledWith("login");
    expect(textarea(view.container)?.value).toBe("Do you work with color-treated hair?");
    view.cleanup();
  });

  it.each(["TECH", "ADMIN"] as const)("shows neutral customer-only guidance to a %s account", async (role) => {
    auth.authUser = { id: "account-1", role };
    const view = await renderDialog();

    expect(view.container.textContent).toContain("Only customer accounts can send a message request.");
    expect(buttonNamed(view.container, "Send request")).toBeNull();
    view.cleanup();
  });

  it("does not allow a request draft longer than 2,000 Unicode code points", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    const view = await renderDialog();
    await enterDraft(view.container, "🙂".repeat(2001));

    expect(view.container.textContent).toContain("2001 / 2000");
    expect(buttonNamed(view.container, "Send request")?.disabled).toBe(true);
    view.cleanup();
  });

  it("submits a customer request once and routes to its pending conversation", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest.mockResolvedValue({ conversation: { id: "conversation-1" }, message: { id: "message-1" } });
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());

    expect(createMessageRequest).toHaveBeenCalledWith(expect.objectContaining({
      techProfileId: "tech-1",
      body: "Can you help with a soft gel overlay?",
      clientRequestId: expect.any(String)
    }));
    expect(refreshUnread).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/messages?conversation=conversation-1");
    view.cleanup();
  });

  it("reuses the request id when a retry follows an uncertain failure", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ conversation: { id: "conversation-1" }, message: { id: "message-1" } });
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());
    await act(async () => buttonNamed(view.container, "Try again")?.click());

    const [first, second] = createMessageRequest.mock.calls;
    expect(first[0].clientRequestId).toBe(second[0].clientRequestId);
    view.cleanup();
  });

  it("does not navigate or refresh after Cancel invalidates a pending request", async () => {
    auth.authUser = { id: "customer-a", role: "CUSTOMER" };
    const request = deferred<{ conversation: { id: string }; message: { id: string } }>();
    createMessageRequest.mockReturnValue(request.promise);
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());
    await act(async () => buttonNamed(view.container, "Cancel")?.click());
    await act(async () => request.resolve({ conversation: { id: "conversation-a" }, message: { id: "message-a" } }));

    expect(push).not.toHaveBeenCalled();
    expect(refreshUnread).not.toHaveBeenCalled();
    expect(buttonNamed(view.container, "Send request")?.disabled).toBe(false);
    view.cleanup();
  });

  it("does not let customer A's late request completion affect customer B", async () => {
    auth.authUser = { id: "customer-a", role: "CUSTOMER" };
    const request = deferred<{ conversation: { id: string }; message: { id: string } }>();
    createMessageRequest.mockReturnValue(request.promise);
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());
    auth.authUser = { id: "customer-b", role: "CUSTOMER" };
    await view.rerender();
    await act(async () => request.resolve({ conversation: { id: "conversation-a" }, message: { id: "message-a" } }));

    expect(push).not.toHaveBeenCalled();
    expect(refreshUnread).not.toHaveBeenCalled();
    expect(buttonNamed(view.container, "Send request")?.disabled).toBe(false);
    view.cleanup();
  });

  it("uses a new request id after editing a draft rejected by the REST validation contract", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest
      .mockRejectedValueOnce(new ApiClientError({
        status: 422,
        code: "validation_error",
        message: "Request validation failed",
        issues: { fieldErrors: { body: ["Message must be at most 2000 characters"] }, formErrors: [] }
      }))
      .mockResolvedValueOnce({ conversation: { id: "conversation-1" }, message: { id: "message-1" } });
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());
    const firstRequestId = createMessageRequest.mock.calls[0]?.[0].clientRequestId;
    await enterDraft(view.container, "Can you help with a structured overlay?");
    await act(async () => buttonNamed(view.container, "Send request")?.click());

    expect(createMessageRequest.mock.calls[1]?.[0].clientRequestId).not.toBe(firstRequestId);
    view.cleanup();
  });

  it("explains the next request date after a cooldown response", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest.mockRejectedValue(new ApiClientError({
      status: 409,
      code: "request_cooldown",
      message: "Try later",
      details: { nextAllowedAt: "2026-09-14T16:00:00.000Z" }
    }));
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());

    expect(view.container.textContent).toContain("September 14, 2026");
    view.cleanup();
  });

  it("uses neutral copy for a blocked request", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest.mockRejectedValue(new ApiClientError({ status: 403, code: "messaging_blocked", message: "Blocked" }));
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());

    expect(view.container.textContent).toContain("Messaging is unavailable for this profile.");
    view.cleanup();
  });

  it("uses self-contact guidance for a forbidden request", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    createMessageRequest.mockRejectedValue(new ApiClientError({ status: 403, code: "forbidden", message: "You cannot message your own tech profile" }));
    const view = await renderDialog();
    await enterDraft(view.container, "Can you help with a soft gel overlay?");

    await act(async () => buttonNamed(view.container, "Send request")?.click());

    expect(view.container.textContent).toContain("You cannot send a message request to your own profile.");
    view.cleanup();
  });

  it("traps focus, closes on Escape, and restores focus to the opening action", async () => {
    auth.authUser = { id: "customer-1", role: "CUSTOMER" };
    const window = new Window();
    Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, KeyboardEvent: window.KeyboardEvent });
    const trigger = document.createElement("button");
    trigger.textContent = "Message this tech";
    document.body.append(trigger);
    trigger.focus();
    const view = await renderDialog({ trigger });
    const close = view.container.querySelector<HTMLButtonElement>("button.message-request-dialog__close");
    const send = buttonNamed(view.container, "Send request");

    await act(async () => send?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }) as unknown as Event));
    expect(document.activeElement).toBe(close);
    await act(async () => close?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(document.activeElement).toBe(trigger);
    view.cleanup();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

async function renderDialog({ trigger }: { trigger?: HTMLButtonElement } = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, KeyboardEvent: window.KeyboardEvent });
  if (trigger) document.body.append(trigger);
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = async () => {
    await act(async () => {
      root.render(createElement(MessageRequestDialog, {
      open: true,
      techProfileId: "tech-1",
      techName: "Mia Chen",
      trigger,
      onClose: vi.fn()
      }));
    });
  };
  await render();
  return { container, rerender: render, cleanup: () => { act(() => root.unmount()); window.close(); } };
}

function textarea(container: HTMLElement) { return container.querySelector<HTMLTextAreaElement>("textarea"); }
function buttonNamed(container: HTMLElement, name: string) { return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === name) ?? null; }
async function enterDraft(container: HTMLElement, value: string) {
  const field = textarea(container);
  if (!field) throw new Error("Expected request textarea");
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
