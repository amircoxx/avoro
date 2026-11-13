import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initialWindow = new Window();
Object.assign(globalThis, { window: initialWindow, document: initialWindow.document, HTMLElement: initialWindow.HTMLElement, Event: initialWindow.Event, KeyboardEvent: initialWindow.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true });
const { act } = await import("react");
const { StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MessageComposer } = await import("../message-composer");

describe("MessageComposer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("counts Unicode code points and disables whitespace-only or over-limit drafts", async () => {
    const view = await renderComposer();
    await enter(view, "A💅");
    expect(view.container.textContent).toContain("2 / 2,000");
    await enter(view, "   \n");
    expect(button(view, "Send message").disabled).toBe(true);
    await enter(view, "x".repeat(2_001));
    expect(button(view, "Send message").disabled).toBe(true);
    view.cleanup();
  });

  it("sends with Enter while Shift+Enter preserves a multiline draft", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const view = await renderComposer({ onSend });
    await enter(view, "First line");
    await keydown(view, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    await keydown(view, { key: "Enter" });
    await flush();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toMatchObject({ body: "First line" });
    expect(textarea(view).value).toBe("");
    view.cleanup();
  });

  it("shows pending then uncertain state and retries with the same client request id", async () => {
    const first = deferred<void>();
    const onSend = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("Still offline"));
    const view = await renderComposer({ onSend });
    await enter(view, "Can you help?");
    await click(view, "Send message");
    expect(view.container.textContent).toContain("Sending message");
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(view.container.textContent).toContain("Taking longer than expected");
    await act(async () => first.reject(new Error("Connection interrupted")));
    await flush();
    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Connection interrupted");
    await click(view, "Retry message");
    await flush();
    expect(onSend.mock.calls[1]?.[0].clientRequestId).toBe(onSend.mock.calls[0]?.[0].clientRequestId);
    expect(textarea(view).value).toBe("Can you help?");
    view.cleanup();
  });

  it("preserves the draft while reconnecting and clears only after canonical success", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const view = await renderComposer({ connectionState: "reconnecting", onSend });
    await enter(view, "Saved draft");
    expect(button(view, "Send message").disabled).toBe(true);
    expect(textarea(view).value).toBe("Saved draft");
    await view.rerender({ connectionState: "connected", onSend });
    await click(view, "Send message");
    await flush();
    expect(textarea(view).value).toBe("");
    view.cleanup();
  });

  it("explains why composing is unavailable", async () => {
    const view = await renderComposer({ disabledReason: "This request must be accepted before you can reply." });
    expect(textarea(view).disabled).toBe(true);
    expect(view.container.textContent).toContain("accepted before you can reply");
    view.cleanup();
  });

  it("clears canonical sends under the application's StrictMode lifecycle", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const view = await renderComposer({ onSend }, true);
    await enter(view, "Strict mode message");
    await click(view, "Send message");
    await flush();
    expect(textarea(view).value).toBe("");
    expect(view.container.textContent).not.toContain("Sending message");
    view.cleanup();
  });

  it("preserves edits made while an earlier send awaits canonical success", async () => {
    const pending = deferred<void>();
    const view = await renderComposer({ onSend: vi.fn().mockReturnValue(pending.promise) });
    await enter(view, "First message");
    await click(view, "Send message");
    await enter(view, "Second draft");
    await act(async () => pending.resolve());
    await flush();
    expect(textarea(view).value).toBe("Second draft");
    view.cleanup();
  });
});

type Props = Parameters<typeof MessageComposer>[0];

async function renderComposer(overrides: Partial<Props> = {}, strict = false) {
  const pageWindow = new Window();
  Object.assign(globalThis, { window: pageWindow, document: pageWindow.document, HTMLElement: pageWindow.HTMLElement, Event: pageWindow.Event, KeyboardEvent: pageWindow.KeyboardEvent });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  let props: Props = { connectionState: "connected", onSend: vi.fn().mockResolvedValue(undefined), ...overrides };
  const render = async () => act(async () => root.render(strict ? <StrictMode><MessageComposer {...props} /></StrictMode> : <MessageComposer {...props} />));
  await render();
  return {
    container,
    rerender: async (next: Partial<Props>) => { props = { ...props, ...next }; await render(); },
    cleanup: () => { act(() => root.unmount()); pageWindow.close(); }
  };
}

function textarea(view: { container: HTMLElement }) { return view.container.querySelector<HTMLTextAreaElement>("textarea")!; }
function button(view: { container: HTMLElement }, name: string) { return Array.from(view.container.querySelectorAll("button")).find((item) => item.textContent?.trim() === name)!; }
async function enter(view: { container: HTMLElement }, value: string) {
  const field = textarea(view);
  const pageWindow = field.ownerDocument.defaultView;
  await act(async () => {
    Object.getOwnPropertyDescriptor(pageWindow?.HTMLTextAreaElement.prototype ?? {}, "value")?.set?.call(field, value);
    field.dispatchEvent(new (pageWindow?.Event ?? Event)("input", { bubbles: true }));
    field.dispatchEvent(new (pageWindow?.Event ?? Event)("change", { bubbles: true }));
  });
}
async function keydown(view: { container: HTMLElement }, init: KeyboardEventInit) { await act(async () => textarea(view).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))); }
async function click(view: { container: HTMLElement }, name: string) { await act(async () => button(view, name).click()); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; }); return { promise, resolve, reject }; }
