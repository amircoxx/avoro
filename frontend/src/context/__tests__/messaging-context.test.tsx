import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider, useMessaging } from "../messaging-context";

const { getMessagingStatus, createMessagingSocket, createMessagingFacade, useAccountAuth } = vi.hoisted(() => ({
  getMessagingStatus: vi.fn(),
  createMessagingSocket: vi.fn(),
  createMessagingFacade: vi.fn(),
  useAccountAuth: vi.fn()
}));

vi.mock("@/services/api/messaging", () => ({ getMessagingStatus }));
vi.mock("@/services/messaging-socket", () => ({ createMessagingSocket }));
vi.mock("@/facades/messaging.facade", () => ({ createMessagingFacade }));
vi.mock("../account-auth-context", () => ({ useAccountAuth }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MessagingProvider", () => {
  afterEach(() => vi.resetAllMocks());

  it("does not create a live client when server capability is disabled", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: false });
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();

    expect(view.container.textContent).toContain("disabled");
    expect(createMessagingSocket).not.toHaveBeenCalled();
    expect(createMessagingFacade).not.toHaveBeenCalled();

    view.cleanup();
  });

  it("connects one authenticated customer and exposes the same live client to consumers", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const socket = socketDouble();
    const facade = facadeDouble();
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    const view = await renderMessaging();

    await waitFor(() => expect(facade.loadWorkspace).toHaveBeenCalledTimes(1));
    expect(facade.loadWorkspace).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("live");
    expect(view.container.textContent).toContain("shared facade");

    view.cleanup();
  });

  it("disconnects and resets derived messaging state after logout", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    const facade = facadeDouble({ unread: summary(3) });
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(view.container.textContent).toContain("3 unread messages"));

    useAccountAuth.mockReturnValue({ authUser: null });
    await view.rerender();

    expect(facade.disconnect).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("0 unread messages");
    expect(view.container.textContent).toContain("disconnected");

    view.cleanup();
  });

  it("ignores stale unread events after an account switch", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const firstSocket = socketDouble();
    const secondSocket = socketDouble();
    createMessagingSocket.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    createMessagingFacade.mockReturnValueOnce(facadeDouble()).mockReturnValueOnce(facadeDouble());
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(createMessagingFacade).toHaveBeenCalledTimes(1));

    useAccountAuth.mockReturnValue({ authUser: customer("customer-2") });
    await view.rerender();
    await waitFor(() => expect(createMessagingFacade).toHaveBeenCalledTimes(2));
    act(() => firstSocket.emitUnread(summary(9)));

    expect(view.container.textContent).toContain("0 unread messages");

    view.cleanup();
  });

  it("publishes unread socket updates after workspace bootstrap", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facadeDouble());
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(createMessagingFacade).toHaveBeenCalledTimes(1));

    act(() => socket.emitUnread(summary(3)));

    expect(view.container.textContent).toContain("3 unread messages");
    view.cleanup();
  });

  it("keeps socket events buffered by the facade until the REST workspace resolves", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const workspace = deferred<ReturnType<typeof workspaceResult>>();
    const socket = socketDouble();
    const facade = facadeDouble();
    facade.loadWorkspace.mockReturnValue(workspace.promise);
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();

    act(() => socket.emitUnread(summary(3)));
    expect(view.container.textContent).toContain("0 unread messages");
    await act(async () => {
      workspace.resolve(workspaceResult(summary(3), "18"));
      await workspace.promise;
    });

    expect(view.container.textContent).toContain("3 unread messages");
    view.cleanup();
  });

  it("recovers once after a reconnect that finishes before the initial workspace snapshot", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const workspace = deferred<ReturnType<typeof workspaceResult>>();
    const socket = socketDouble();
    const facade = facadeDouble();
    facade.loadWorkspace.mockReturnValue(workspace.promise);
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();

    await act(async () => {
      socket.emitConnection("connected");
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
      await Promise.resolve();
    });
    expect(facade.recoverAfterReconnect).not.toHaveBeenCalled();

    await act(async () => {
      workspace.resolve(workspaceResult(summary(0), "18"));
      await workspace.promise;
    });
    await waitFor(() => expect(facade.recoverAfterReconnect).toHaveBeenCalledTimes(1));
    expect(facade.recoverAfterReconnect).toHaveBeenCalledWith("18");

    view.cleanup();
  });

  it("runs first-connect catch-up exactly once when the snapshot finishes during the handshake", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    const facade = facadeDouble({ sequence: "18" });
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(facade.loadWorkspace).toHaveBeenCalledTimes(1));
    expect(facade.recoverAfterReconnect).not.toHaveBeenCalled();

    await act(async () => {
      socket.emitConnection("connected");
      await Promise.resolve();
    });

    await waitFor(() => expect(facade.recoverAfterReconnect).toHaveBeenCalledWith("18"));
    expect(facade.recoverAfterReconnect).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  it("recovers the facade from its last REST-confirmed cursor on reconnect", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    const facade = facadeDouble({ sequence: "18" });
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(facade.loadWorkspace).toHaveBeenCalledTimes(1));

    await act(async () => {
      socket.emitConnection("connected");
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
      await Promise.resolve();
    });
    await waitFor(() => expect(facade.recoverAfterReconnect).toHaveBeenCalledWith("18"));

    view.cleanup();
  });

  it("publishes recovered canonical messages to mounted consumers", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    const facade = facadeDouble({ sequence: "18" });
    facade.recoverAfterReconnect.mockResolvedValue({ ...workspaceResult(summary(1), "19"), messages: [{ id: "message-19" }] });
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(facade.loadWorkspace).toHaveBeenCalledTimes(1));

    await act(async () => {
      socket.emitConnection("connected");
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
      await Promise.resolve();
    });

    await waitFor(() => expect(view.container.textContent).toContain("1 canonical messages"));
    view.cleanup();
  });

  it("coalesces reconnects that arrive during recovery into one follow-up from the newest cursor", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const firstRecovery = deferred<ReturnType<typeof workspaceResult>>();
    const secondRecovery = deferred<ReturnType<typeof workspaceResult>>();
    const socket = socketDouble();
    const facade = facadeDouble({ sequence: "18" });
    facade.recoverAfterReconnect.mockReturnValueOnce(firstRecovery.promise).mockReturnValueOnce(secondRecovery.promise);
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facade);
    useAccountAuth.mockReturnValue({ authUser: customer("customer-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(facade.loadWorkspace).toHaveBeenCalledTimes(1));

    await act(async () => {
      socket.emitConnection("connected");
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
      await Promise.resolve();
    });
    await waitFor(() => expect(facade.recoverAfterReconnect).toHaveBeenCalledWith("18"));

    act(() => {
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
      socket.emitConnection("reconnecting");
      socket.emitConnection("connected");
    });
    expect(facade.recoverAfterReconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRecovery.resolve(workspaceResult(summary(0), "20"));
      await firstRecovery.promise;
    });
    await waitFor(() => expect(facade.recoverAfterReconnect).toHaveBeenCalledTimes(2));
    expect(facade.recoverAfterReconnect).toHaveBeenLastCalledWith("20");

    await act(async () => {
      secondRecovery.resolve(workspaceResult(summary(0), "21"));
      await secondRecovery.promise;
    });
    expect(facade.recoverAfterReconnect).toHaveBeenCalledTimes(2);

    view.cleanup();
  });

  it("removes socket listeners and disconnects during provider cleanup", async () => {
    getMessagingStatus.mockResolvedValue({ enabled: true });
    const socket = socketDouble();
    createMessagingSocket.mockReturnValue(socket);
    createMessagingFacade.mockReturnValue(facadeDouble());
    useAccountAuth.mockReturnValue({ authUser: tech("tech-1") });
    const view = await renderMessaging();
    await waitFor(() => expect(createMessagingFacade).toHaveBeenCalledTimes(1));

    view.cleanup();

    expect(createMessagingFacade.mock.results[0]?.value.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.stopUnread).toHaveBeenCalledTimes(1);
    expect(socket.stopConnection).toHaveBeenCalledTimes(1);
  });
});

function MessagingProbe() {
  const { enabled, unread, connectionState, live, facade, workspace } = useMessaging();
  return createElement("div", undefined, enabled ? "enabled" : "disabled", " ", `${unread.total} unread messages`, " ", connectionState, " ", live ? "live" : "no live client", " ", facade ? "shared facade" : "no facade", " ", `${workspace?.messages.length ?? 0} canonical messages`);
}

async function renderMessaging() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MessagingProvider, undefined, createElement(MessagingProbe))));
  return {
    container,
    rerender: async () => { await act(async () => root.render(createElement(MessagingProvider, undefined, createElement(MessagingProbe)))); },
    cleanup: () => { act(() => root.unmount()); window.close(); }
  };
}

function socketDouble() {
  let unread: ((next: ReturnType<typeof summary>) => void) | undefined;
  let connection: ((next: "connected" | "reconnecting" | "disconnected" | "session-invalid") => void) | undefined;
  const stopUnread = vi.fn(() => { unread = undefined; });
  const stopConnection = vi.fn(() => { connection = undefined; });
  return {
    connect: vi.fn(), disconnect: vi.fn(), sendMessage: vi.fn(), onMessage: vi.fn(() => vi.fn()), onConversation: vi.fn(() => vi.fn()),
    onUnread: vi.fn((listener) => { unread = listener; return stopUnread; }),
    onConnection: vi.fn((listener) => { connection = listener; return stopConnection; }),
    emitUnread: (next: ReturnType<typeof summary>) => unread?.(next),
    emitConnection: (next: "connected" | "reconnecting" | "disconnected" | "session-invalid") => connection?.(next),
    stopUnread, stopConnection
  };
}

function facadeDouble({ unread = summary(0), sequence = "0" }: { unread?: ReturnType<typeof summary>; sequence?: string } = {}) {
  const subscriptions = new Set<(workspace: ReturnType<typeof workspaceResult>) => void>();
  return {
    loadWorkspace: vi.fn().mockResolvedValue(workspaceResult(unread, sequence)),
    recoverAfterReconnect: vi.fn().mockResolvedValue(workspaceResult(unread, sequence)),
    loadConversationPage: vi.fn(), loadOlderMessages: vi.fn(), createMessageRequest: vi.fn(), acceptMessageRequest: vi.fn(), declineMessageRequest: vi.fn(), markMessagesRead: vi.fn(), archiveConversation: vi.fn(), restoreConversation: vi.fn(), blockConversation: vi.fn(), unblockConversation: vi.fn(), sendMessage: vi.fn(),
    subscribe: vi.fn((listener) => { subscriptions.add(listener); return () => subscriptions.delete(listener); }),
    disconnect: vi.fn()
  };
}

function workspaceResult(unread: ReturnType<typeof summary>, sequence: string) {
  return { conversations: [], messages: [], unread, nextConversationCursor: null, lastRestConfirmedSequence: sequence };
}

function summary(total: number) { return { unreadMessages: total, pendingRequests: 0, total }; }
function customer(id: string) { return { id, email: `${id}@example.com`, role: "CUSTOMER" as const, fullName: null, avatarUrl: null }; }
function tech(id: string) { return { id, email: `${id}@example.com`, role: "TECH" as const, fullName: null, avatarUrl: null }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; }); return { promise, resolve }; }
async function waitFor(assertion: () => void) { for (let attempt = 0; attempt < 20; attempt += 1) { try { assertion(); return; } catch { await act(async () => { await Promise.resolve(); }); } } assertion(); }
