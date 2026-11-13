import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ScheduleFacade } from "@/facades/schedule.facade";
import type { ScheduleService } from "@/services/api";

const initialWindow = new Window();
Object.assign(globalThis, { window: initialWindow, document: initialWindow.document, HTMLElement: initialWindow.HTMLElement, Event: initialWindow.Event, IS_REACT_ACT_ENVIRONMENT: true });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const {
  centsToDollarInput,
  dollarsToCents,
  isIncompleteService,
  serviceToWrite,
  validateServiceDraft,
  ServicesEditor
} = await import("../services-editor");

describe("services editor rules", () => {
  it("converts decimal dollar strings to cents without floating-point arithmetic", () => {
    expect(dollarsToCents("85")).toBe(8500);
    expect(dollarsToCents("85.5")).toBe(8550);
    expect(dollarsToCents("85.05")).toBe(8505);
    expect(dollarsToCents("0.10")).toBe(10);
    expect(dollarsToCents("85.005")).toBeNull();
    expect(dollarsToCents("1e2")).toBeNull();
    expect(centsToDollarInput(8505)).toBe("85.05");
  });

  it("requires a name, integer backend-valid duration, and explicit price", () => {
    expect(validateServiceDraft({ name: "", description: "", durationMinutes: "90", priceDollars: "85", isActive: true })).toMatchObject({ value: null, field: "name" });
    expect(validateServiceDraft({ name: "Gel-X", description: "", durationMinutes: "4", priceDollars: "85", isActive: true })).toMatchObject({ value: null, field: "durationMinutes" });
    expect(validateServiceDraft({ name: "Gel-X", description: "", durationMinutes: "90.5", priceDollars: "85", isActive: true })).toMatchObject({ value: null, field: "durationMinutes" });
    expect(validateServiceDraft({ name: "Gel-X", description: "", durationMinutes: "90", priceDollars: "", isActive: true })).toMatchObject({ value: null, field: "priceDollars" });
    expect(validateServiceDraft({ name: "Gel-X", description: "", durationMinutes: "90", priceDollars: "85.50", isActive: true })).toMatchObject({
      value: { name: "Gel-X", description: "", durationMinutes: 90, startingPriceCents: 8550, isActive: true }, error: null
    });
  });

  it("keeps incomplete legacy rows visible but blocks activation until completed", () => {
    expect(isIncompleteService({ id: "legacy", name: "Legacy", description: "", durationMinutes: 0, startingPriceCents: 0, isActive: false })).toBe(true);
    const result = validateServiceDraft({ name: "Legacy", description: "", durationMinutes: "0", priceDollars: "", isActive: true });
    expect(result).toMatchObject({ value: null, error: expect.stringMatching(/complete/i) });
  });

  it("builds an exact lifecycle payload without leaking the stable record id", () => {
    expect(serviceToWrite({ id: "service-1", name: "Gel-X", description: "Structured", durationMinutes: 90, startingPriceCents: 8500, isActive: true }, false)).toEqual({
      name: "Gel-X", description: "Structured", durationMinutes: 90, startingPriceCents: 8500, isActive: false
    });
  });

  it("shows nullable legacy fields as incomplete without converting missing price to zero", async () => {
    const view = await renderEditor({ services: [service({ durationMinutes: null, startingPriceCents: null, isActive: false })] });

    expect(view.container.textContent).toContain("Incomplete");
    expect(view.container.textContent).toContain("Needs duration");
    expect(view.container.textContent).toContain("Needs price");
    expect(view.container.textContent).not.toContain("$0.00");
    view.cleanup();
  });

  it("adds a service and replaces the draft with the server-canonical record", async () => {
    const facade = facadeStub();
    facade.createService.mockResolvedValue(service({ id: "created", name: "Canonical Gel-X", description: "Server copy", startingPriceCents: 8505 }));
    const view = await renderEditor({ facade });
    await click(buttonNamed(view.container, "Add service"));
    await setValue(inputNamed(view.container, "Service name"), "Gel-X");
    await setValue(inputNamed(view.container, "Duration"), "90");
    await setValue(inputNamed(view.container, "Starting price"), "85.05");
    await setValue(inputNamed(view.container, "Description"), "Client copy");
    await submit(view.container.querySelector(".schedule-service-form"));

    expect(facade.createService).toHaveBeenCalledWith({ name: "Gel-X", description: "Client copy", durationMinutes: 90, startingPriceCents: 8505, isActive: true });
    expect(view.container.textContent).toContain("Canonical Gel-X");
    expect(view.container.textContent).toContain("Server copy");
    expect(view.container.querySelector(".schedule-service-form")).toBeNull();
    view.cleanup();
  });

  it("retains an edited draft after a failed save and focuses the error", async () => {
    const facade = facadeStub();
    facade.updateService.mockRejectedValue(new Error("Service save unavailable"));
    const view = await renderEditor({ facade, services: [service()] });
    await click(buttonNamed(view.container, "Edit"));
    await setValue(inputNamed(view.container, "Service name"), "Unsaved Gel-X");
    await submit(view.container.querySelector(".schedule-service-form"));

    const alert = view.container.querySelector<HTMLElement>('[role="alert"]');
    expect(inputNamed(view.container, "Service name")?.value).toBe("Unsaved Gel-X");
    expect(alert?.textContent).toContain("Service save unavailable");
    expect(view.document.activeElement).toBe(alert);
    view.cleanup();
  });

  it("edits, deactivates, and reactivates the same stable record", async () => {
    const facade = facadeStub();
    facade.updateService
      .mockResolvedValueOnce(service({ name: "Canonical edit", description: "Updated" }))
      .mockResolvedValueOnce(service({ name: "Canonical edit", description: "Updated", isActive: false }))
      .mockResolvedValueOnce(service({ name: "Canonical edit", description: "Updated", isActive: true }));
    const view = await renderEditor({ facade, services: [service()] });
    await click(buttonNamed(view.container, "Edit"));
    await setValue(inputNamed(view.container, "Service name"), "Client edit");
    await submit(view.container.querySelector(".schedule-service-form"));
    expect(view.container.textContent).toContain("Canonical edit");

    await click(buttonNamed(view.container, "Deactivate"));
    expect(facade.updateService).toHaveBeenNthCalledWith(2, "service-1", expect.objectContaining({ isActive: false }));
    await click(buttonNamed(view.container, "Reactivate"));
    expect(facade.updateService).toHaveBeenNthCalledWith(3, "service-1", expect.objectContaining({ isActive: true }));
    view.cleanup();
  });

  it("blocks activation with null duration and price until explicit completion", async () => {
    const facade = facadeStub();
    facade.updateService.mockResolvedValue(service({ startingPriceCents: 1250, isActive: true }));
    const view = await renderEditor({ facade, services: [service({ durationMinutes: null, startingPriceCents: null, isActive: false })] });
    await click(buttonNamed(view.container, "Reactivate"));

    expect(facade.updateService).not.toHaveBeenCalled();
    expect(inputNamed(view.container, "Duration")?.value).toBe("");
    expect(inputNamed(view.container, "Starting price")?.value).toBe("");
    expect(view.document.activeElement?.getAttribute("role")).toBe("alert");

    await setValue(inputNamed(view.container, "Duration"), "90");
    await setValue(inputNamed(view.container, "Starting price"), "12.50");
    await submit(view.container.querySelector(".schedule-service-form"));
    expect(facade.updateService).toHaveBeenCalledWith("service-1", {
      name: "Gel-X", description: "Structured set", durationMinutes: 90, startingPriceCents: 1250, isActive: true
    });
    view.cleanup();
  });

  it("focuses validation errors without calling the facade", async () => {
    const facade = facadeStub();
    const view = await renderEditor({ facade });
    await click(buttonNamed(view.container, "Add service"));
    await submit(view.container.querySelector(".schedule-service-form"));

    expect(facade.createService).not.toHaveBeenCalled();
    expect(view.document.activeElement?.getAttribute("role")).toBe("alert");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("service name");
    view.cleanup();
  });

  it("ignores an old owner's late save response", async () => {
    const pending = deferred<ScheduleService>();
    const facade = facadeStub();
    facade.updateService.mockReturnValueOnce(pending.promise);
    const view = await renderEditor({ facade, scopeKey: "tech-1", services: [service({ name: "First owner" })] });
    await click(buttonNamed(view.container, "Edit"));
    await setValue(inputNamed(view.container, "Service name"), "First owner draft");
    await submitWithoutWaiting(view.container.querySelector(".schedule-service-form"));

    await view.rerender({ scopeKey: "tech-2", services: [service({ id: "service-2", name: "Second owner" })] });
    pending.resolve(service({ name: "Stale canonical" }));
    await flush();

    expect(view.container.textContent).toContain("Second owner");
    expect(view.container.textContent).not.toContain("Stale canonical");
    view.cleanup();
  });

  it("uses item-specific accessible labels for service actions", async () => {
    const view = await renderEditor({ services: [service({ name: "Gel-X Full Set" })] });

    expect(view.container.querySelector('button[aria-label="Edit Gel-X Full Set"]')).not.toBeNull();
    expect(view.container.querySelector('button[aria-label="Deactivate Gel-X Full Set"]')).not.toBeNull();
    view.cleanup();
  });
});

type FacadeStub = ScheduleFacade & {
  createService: ReturnType<typeof vi.fn>;
  updateService: ReturnType<typeof vi.fn>;
};

function facadeStub(): FacadeStub {
  return { createService: vi.fn(), updateService: vi.fn() } as unknown as FacadeStub;
}

function service(overrides: Partial<ScheduleService> = {}): ScheduleService {
  return {
    id: "service-1",
    name: "Gel-X",
    description: "Structured set",
    durationMinutes: 90,
    startingPriceCents: 8500,
    isActive: true,
    ...overrides
  };
}

async function renderEditor({
  facade = facadeStub(),
  scopeKey = "tech-1",
  services = []
}: {
  facade?: FacadeStub;
  scopeKey?: string;
  services?: ScheduleService[];
} = {}) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const document = window.document as unknown as Document;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = (nextScopeKey: string, nextServices: ScheduleService[]) => root.render(<ServicesEditor scopeKey={nextScopeKey} services={nextServices} facade={facade} />);
  await act(async () => render(scopeKey, services));
  return {
    container,
    document,
    facade,
    rerender: async ({ scopeKey: nextScopeKey, services: nextServices }: { scopeKey: string; services: ScheduleService[] }) => act(async () => render(nextScopeKey, nextServices)),
    cleanup: () => { act(() => root.unmount()); window.close(); }
  };
}

function buttonNamed(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Button ${name} was not rendered`);
  return button;
}

function inputNamed(container: HTMLElement, label: string) {
  const field = Array.from(container.querySelectorAll<HTMLLabelElement>("label")).find((candidate) => candidate.querySelector(":scope > span")?.textContent === label);
  return field?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? null;
}

async function setValue(input: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!input) throw new Error("Expected form field");
  const view = input.ownerDocument.defaultView;
  const prototype = input.tagName === "TEXTAREA" ? view?.HTMLTextAreaElement.prototype : view?.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype ?? {}, "value")?.set?.call(input, value);
    input.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
    input.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  });
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

async function submit(form: Element | null) {
  if (!form) throw new Error("Service form was not rendered");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await flush();
}

async function submitWithoutWaiting(form: Element | null) {
  if (!form) throw new Error("Service form was not rendered");
  act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
