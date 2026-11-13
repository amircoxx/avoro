import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagingFacade, MessagingWorkspace } from "@/facades/messaging.facade";
import type { AuthUser, ConversationDto, MessageDto } from "@/services/api";
import MessagesPage from "../messages-page";

const { auth, messaging, router } = vi.hoisted(() => ({
  auth: { user: null as AuthUser | null, loading: false },
  messaging: { enabled: true, unread: { unreadMessages: 1, pendingRequests: 1, total: 2 }, connectionState: "connected", live: null as ReturnType<typeof liveDouble> | null, facade: null as MessagingFacade | null, workspace: null as MessagingWorkspace | null, refreshUnread: vi.fn() },
  router: { push: vi.fn(), searchParams: new URLSearchParams() }
}));

vi.mock("@/context/account-auth-context", () => ({ useAccountAuth: () => ({ authUser: auth.user, isAuthLoading: auth.loading }) }));
vi.mock("@/context/messaging-context", () => ({ useMessaging: () => messaging }));
vi.mock("@/hooks/router", () => ({ useRouter: () => router, useSearchParams: () => router.searchParams }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MessagesPage", () => {
  afterEach(() => { auth.user = null; auth.loading = false; messaging.live = null; messaging.facade = null; messaging.connectionState = "connected"; router.searchParams = new URLSearchParams(); vi.resetAllMocks(); });

  it("waits for auth and redirects logged-out and admin accounts without loading", async () => {
    auth.loading = true;
    const facade = facadeDouble();
    const view = await renderPage(facade);
    expect(view.container.textContent).toContain("Loading messages");
    expect(facade.loadWorkspace).not.toHaveBeenCalled();
    auth.loading = false;
    auth.user = user("ADMIN");
    await view.rerender();
    expect(router.push).toHaveBeenCalledWith("/");
    expect(facade.loadWorkspace).not.toHaveBeenCalled();
    view.cleanup();
  });

  it("loads a customer inbox into the desktop list and detail workspace without a Requests filter", async () => {
    auth.user = user("CUSTOMER");
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(workspace()) });
    const view = await renderPage(facade);
    await waitFor(() => expect(view.container.querySelector("main[aria-labelledby='messages-title']")).not.toBeNull());
    expect(view.container.textContent).toContain("Conversation inbox");
    expect(view.container.textContent).toContain("Jordan Lee");
    expect(view.container.textContent).toContain("Could you do this design?");
    expect(buttonNamed(view.container, "Requests, 1 pending")).toBeUndefined();
    expect(view.container.querySelector("[aria-current='true']")).not.toBeNull();
    view.cleanup();
  });

  it("selects the valid conversation named by the profile-success query", async () => {
    auth.user = user("CUSTOMER");
    const requestedId = "8a01c8f3-22eb-443b-a3cc-6408dbd5a960";
    const requestedMessage = message({ id: "requested-message", conversationId: requestedId, sequence: "9007199254740994", body: "Requested thread" });
    const requested = conversation({ id: requestedId, counterpart: { userId: "tech-2", displayName: "Morgan Vale", avatarUrl: null }, lastMessage: requestedMessage });
    router.searchParams = new URLSearchParams({ conversation: requestedId });
    const initial = { ...workspace(), conversations: [conversation(), requested], messages: [message(), requestedMessage] };

    const view = await renderPage(facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(initial) }));

    await waitFor(() => expect(view.container.querySelector("[aria-current='true']")?.textContent).toContain("Morgan Vale"));
    expect(view.container.textContent).toContain("Requested thread");
    view.cleanup();
  });

  it("pages safely for a requested conversation missing from the first inbox page", async () => {
    auth.user = user("CUSTOMER");
    const requestedId = "8a01c8f3-22eb-443b-a3cc-6408dbd5a960";
    const requestedMessage = message({ id: "requested-message", conversationId: requestedId, sequence: "9007199254740994", body: "Requested later page" });
    const requested = conversation({ id: requestedId, counterpart: { userId: "tech-2", displayName: "Morgan Vale", avatarUrl: null }, lastMessage: requestedMessage });
    router.searchParams = new URLSearchParams({ conversation: requestedId });
    const loadConversationPage = vi.fn()
      .mockResolvedValueOnce({ conversations: [], nextCursor: "active-2", syncSequence: "9007199254740994" })
      .mockResolvedValueOnce({ conversations: [requested], nextCursor: null, syncSequence: "9007199254740994" });
    const facade = facadeDouble({ loadConversationPage });

    const view = await renderPage(facade);
    await waitFor(() => expect(loadConversationPage).toHaveBeenNthCalledWith(2, { archived: false, limit: 30, cursor: "active-2" }));
    await act(async () => {
      emitWorkspace(facade, {
        ...workspace(),
        conversations: [conversation(), requested],
        messages: [message(), requestedMessage]
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(view.container.querySelector("[aria-current='true']")?.textContent).toContain("Morgan Vale"));
    expect(loadConversationPage).toHaveBeenNthCalledWith(1, { archived: false, limit: 30 });
    view.cleanup();
  });

  it("lets a tech filter pending requests, accept one, and enables the composer", async () => {
    auth.user = user("TECH");
    const accepted = conversation({ status: "ACCEPTED" });
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(workspace()), acceptMessageRequest: vi.fn().mockResolvedValue(accepted) });
    const view = await renderPage(facade);
    await waitFor(() => expect(buttonNamed(view.container, "Requests, 1 pending")).toBeDefined());
    await click(view.container, "Requests, 1 pending");
    expect(view.container.textContent).toContain("Request pending");
    await click(view.container, "Accept request");
    await waitFor(() => expect(facade.acceptMessageRequest).toHaveBeenCalledWith("conversation-1"));
    expect(view.container.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(false);
    view.cleanup();
  });

  it("merges live canonical messages by ID, announces only the newest, and advances read state", async () => {
    auth.user = user("CUSTOMER");
    const facade = facadeDouble({
      loadWorkspace: vi.fn().mockResolvedValue(workspace({ conversation: conversation({ status: "ACCEPTED" }) }))
    });
    const view = await renderPage(facade);
    await waitFor(() => expect(view.container.textContent).toContain("Could you do this design?"));
    await waitFor(() => expect(facade.markMessagesRead).toHaveBeenCalled());
    const incoming = message({ id: "message-2", sequence: "9007199254740994", senderUserId: "tech-1", body: "Yes, I can." });
    act(() => { emitWorkspace(facade, workspace({ conversation: conversation({ status: "ACCEPTED", lastMessage: incoming, lastMessageAt: incoming.createdAt }) }), [message(), incoming]); emitWorkspace(facade, workspace({ conversation: conversation({ status: "ACCEPTED", lastMessage: incoming, lastMessageAt: incoming.createdAt }) }), [message(), incoming]); });
    expect(view.container.querySelectorAll("[data-message-id='message-2']")).toHaveLength(1);
    expect(view.container.querySelector("[aria-live='polite']")?.textContent).toContain("Jordan Lee: Yes, I can.");
    view.cleanup();
  });

  it("walks backward through backend-compatible history pages without gaps or duplicates", async () => {
    auth.user = user("CUSTOMER");
    const allMessages = Array.from({ length: 101 }, (_, index) => historyMessage(index + 1));
    const latest = allMessages[100]!;
    const currentConversation = conversation({ status: "ACCEPTED", lastMessage: latest, lastMessageAt: latest.createdAt });
    const initial = { ...workspace({ conversation: currentConversation }), messages: [latest] };
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(initial) });
    let canonical = [latest];
    facade.loadOlderMessages = vi.fn(async (_conversationId, beforeSequence) => {
      const page = beforeSequence === "101"
        ? { messages: allMessages.slice(50, 100), nextSequence: "51", hasMore: true }
        : { messages: allMessages.slice(0, 50), nextSequence: null, hasMore: false };
      canonical = [...page.messages, ...canonical];
      emitWorkspace(facade, { ...initial, messages: canonical });
      return page;
    });
    const view = await renderPage(facade);

    await waitFor(() => expect(facade.loadOlderMessages).toHaveBeenCalledWith("conversation-1", "101"));
    await click(view.container, "Load earlier messages");
    expect(facade.loadOlderMessages).toHaveBeenLastCalledWith("conversation-1", "51");
    const rendered = Array.from(view.container.querySelectorAll<HTMLElement>("[data-message-id]"), (node) => Number(node.dataset.messageId?.replace("message-", "")));
    expect(rendered).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    expect(new Set(rendered).size).toBe(101);
    view.cleanup();
  });

  it("retains Requests when Accept fails", async () => {
    auth.user = user("TECH");
    const facade = facadeDouble({ acceptMessageRequest: vi.fn().mockRejectedValue(new Error("Accept unavailable")) });
    const view = await renderPage(facade);
    await click(view.container, "Requests, 1 pending");
    await click(view.container, "Accept request");
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Accept unavailable"));
    expect(buttonNamed(view.container, "Requests, 1 pending")?.getAttribute("aria-pressed")).toBe("true");
    view.cleanup();
  });

  it("retains Archived when Restore fails", async () => {
    auth.user = user("TECH");
    const archived = conversation({ archivedAt: "2026-08-15T12:00:00.000Z" });
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(workspace({ conversation: archived })), restoreConversation: vi.fn().mockRejectedValue(new Error("Restore unavailable")) });
    const view = await renderPage(facade);
    await click(view.container, "Archived");
    await waitFor(() => expect(buttonNamed(view.container, "Restore conversation")).toBeDefined());
    await click(view.container, "Restore conversation");
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Restore unavailable"));
    expect(buttonNamed(view.container, "Archived")?.getAttribute("aria-pressed")).toBe("true");
    view.cleanup();
  });

  it("does not let a deferred old-owner action change the new owner's filter or error state", async () => {
    auth.user = user("TECH");
    const pending = deferred<ConversationDto>();
    const facade = facadeDouble();
    facade.acceptMessageRequest = vi.fn().mockReturnValue(pending.promise);
    const view = await renderPage(facade);
    await click(view.container, "Requests, 1 pending");
    await click(view.container, "Accept request");
    auth.user = { ...user("TECH"), id: "tech-2", email: "tech-2@example.com" };
    await view.rerender();
    await click(view.container, "Archived");
    await act(async () => pending.reject(new Error("Old owner failure")));
    await flush();
    expect(buttonNamed(view.container, "Archived")?.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.textContent).not.toContain("Old owner failure");
    view.cleanup();
  });

  it("supports mobile drill-in, archive restoration, confirmations, and failed-load recovery", async () => {
    auth.user = user("TECH");
    const firstLoad = vi.fn().mockRejectedValueOnce(new Error("Inbox unavailable")).mockResolvedValueOnce(workspace());
    const facade = facadeDouble({
      loadWorkspace: firstLoad,
      declineMessageRequest: vi.fn().mockResolvedValue(conversation({ status: "DECLINED" }))
    });
    const view = await renderPage(facade, true);
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Inbox unavailable"));
    await click(view.container, "Try again");
    await waitFor(() => expect(view.container.textContent).toContain("Jordan Lee"));
    await click(view.container, "Open conversation with Jordan Lee");
    expect(buttonNamed(view.container, "Back to conversations")).toBeDefined();
    expect(document.activeElement).toBe(buttonNamed(view.container, "Back to conversations"));
    await click(view.container, "Archive conversation");
    await click(view.container, "Archived");
    await click(view.container, "Restore conversation");
    expect(facade.restoreConversation).toHaveBeenCalledWith("conversation-1");
    await click(view.container, "Decline request");
    expect(view.container.querySelector("[role='dialog']")?.textContent).toContain("Decline this request?");
    await click(view.container.querySelector("[role='dialog']")!, "Decline request");
    expect(facade.declineMessageRequest).toHaveBeenCalledWith("conversation-1");
    await click(view.container, "Manage message restriction");
    expect(view.container.querySelector("[role='dialog']")?.textContent).toContain("Manage message restriction");
    expect(view.container.querySelector(".messages-dialog__backdrop")?.tagName).toBe("DIV");
    await click(view.container.querySelector("[role='dialog']")!, "Block messages");
    expect(facade.blockConversation).toHaveBeenCalledWith("conversation-1");
    await click(view.container, "Manage message restriction");
    await click(view.container.querySelector("[role='dialog']")!, "Remove my block");
    expect(facade.unblockConversation).toHaveBeenCalledWith("conversation-1");
    view.cleanup();
  });

  it("requests authoritative filter pages and continues each cursor", async () => {
    auth.user = user("TECH");
    const loadConversationPage = vi.fn()
      .mockResolvedValueOnce({ conversations: [], nextCursor: "requests-2", syncSequence: "9007199254740993" })
      .mockResolvedValueOnce({ conversations: [], nextCursor: null, syncSequence: "9007199254740993" })
      .mockResolvedValueOnce({ conversations: [], nextCursor: "archive-2", syncSequence: "9007199254740993" });
    const facade = facadeDouble({ loadConversationPage });
    const view = await renderPage(facade);
    await click(view.container, "Requests, 1 pending");
    await waitFor(() => expect(loadConversationPage).toHaveBeenCalledWith({ archived: false, status: "PENDING", cursor: undefined, limit: 30 }));
    await click(view.container, "Load more conversations");
    expect(loadConversationPage).toHaveBeenCalledWith({ archived: false, status: "PENDING", cursor: "requests-2", limit: 30 });
    await click(view.container, "Archived");
    await waitFor(() => expect(loadConversationPage).toHaveBeenCalledWith({ archived: true, status: undefined, cursor: undefined, limit: 30 }));
    view.cleanup();
  });

  it("settles a failed initial filter load until the user explicitly retries", async () => {
    auth.user = user("TECH");
    const loadConversationPage = vi.fn()
      .mockRejectedValueOnce(new Error("Archive unavailable"))
      .mockResolvedValueOnce({ conversations: [], nextCursor: null, syncSequence: "9007199254740993" });
    const view = await renderPage(facadeDouble({ loadConversationPage }));

    await click(view.container, "Archived");
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Archive unavailable"));
    await flush();
    await flush();
    expect(loadConversationPage).toHaveBeenCalledTimes(1);
    await click(view.container, "Retry archived conversations");
    await waitFor(() => expect(loadConversationPage).toHaveBeenCalledTimes(2));
    view.cleanup();
  });

  it("uses privacy-neutral block management, hides blocked request decisions, and labels day boundaries", async () => {
    auth.user = user("TECH");
    const blocked = conversation({ isBlocked: true });
    const second = message({ id: "message-2", sequence: "9007199254740994", createdAt: "2026-08-16T12:00:00.000Z" });
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue({ ...workspace({ conversation: blocked }), messages: [message(), second] }) });
    const view = await renderPage(facade);
    await waitFor(() => expect(view.container.textContent).toContain("Messaging is unavailable for this conversation."));
    expect(buttonNamed(view.container, "Accept request")).toBeUndefined();
    expect(view.container.querySelectorAll("[role='separator']")).toHaveLength(2);
    expect(view.container.querySelector("[role='separator']")?.getAttribute("aria-label")).toBeTruthy();
    await click(view.container, "Manage message restriction");
    expect(view.container.querySelector("[role='dialog']")?.textContent).toContain("Manage message restriction");
    await click(view.container.querySelector("[role='dialog']")!, "Block messages");
    expect(facade.blockConversation).toHaveBeenCalledWith("conversation-1");
    await click(view.container, "Manage message restriction");
    await click(view.container.querySelector("[role='dialog']")!, "Remove my block");
    expect(facade.unblockConversation).toHaveBeenCalledWith("conversation-1");
    view.cleanup();
  });

  it("advances reads monotonically when a newer event arrives during an in-flight mark", async () => {
    auth.user = user("CUSTOMER");
    const first = deferred<{ throughSequence: string }>();
    const markMessagesRead = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ throughSequence: "9007199254740994" });
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(workspace({ conversation: conversation({ status: "ACCEPTED" }) })), markMessagesRead });
    const view = await renderPage(facade);
    await waitFor(() => expect(markMessagesRead).toHaveBeenCalledWith("conversation-1", "9007199254740993"));
    const newer = message({ id: "message-2", sequence: "9007199254740994", senderUserId: "tech-1" });
    act(() => emitWorkspace(facade, { ...workspace({ conversation: conversation({ status: "ACCEPTED", lastMessage: newer }) }), messages: [message(), newer] }));
    await act(async () => first.resolve({ throughSequence: "9007199254740993" }));
    await waitFor(() => expect(markMessagesRead).toHaveBeenLastCalledWith("conversation-1", "9007199254740994"));
    view.cleanup();
  });

  it("never carries idle or in-flight composer state across recipients", async () => {
    auth.user = user("CUSTOMER");
    const pending = deferred<{ message: MessageDto; conversation: ConversationDto }>();
    const first = conversation({ status: "ACCEPTED", lastMessageAt: "2026-08-16T12:00:00.000Z" });
    const secondMessage = message({ id: "other-message", conversationId: "conversation-2", sequence: "9007199254740994", body: "Other thread" });
    const second = conversation({ id: "conversation-2", status: "ACCEPTED", counterpart: { userId: "tech-2", displayName: "Morgan Vale", avatarUrl: null }, lastMessage: secondMessage });
    const initial = { ...workspace({ conversation: first }), conversations: [first, second], messages: [message(), secondMessage] };
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(initial), sendMessage: vi.fn().mockReturnValue(pending.promise) });
    const view = await renderPage(facade);
    await enterText(view.container, "Private draft for Jordan");
    await click(view.container, "Open conversation with Morgan Vale");
    expect(view.container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    await click(view.container, "Open conversation with Jordan Lee");
    await enterText(view.container, "Sending only to Jordan");
    await click(view.container, "Send message");
    await click(view.container, "Open conversation with Morgan Vale");
    expect(view.container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    await act(async () => pending.resolve({ message: message({ body: "Sending only to Jordan" }), conversation: first }));
    expect(view.container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    view.cleanup();
  });

  it("ignores old-owner send and read completions after an account switch", async () => {
    auth.user = user("CUSTOMER");
    const pendingSend = deferred<{ message: MessageDto; conversation: ConversationDto }>();
    const pendingRead = deferred<{ throughSequence: string }>();
    const facade = facadeDouble({
      loadWorkspace: vi.fn().mockResolvedValue(workspace({ conversation: conversation({ status: "ACCEPTED" }) })),
      sendMessage: vi.fn().mockReturnValue(pendingSend.promise),
      markMessagesRead: vi.fn().mockReturnValueOnce(pendingRead.promise).mockImplementation(async (_id, throughSequence) => ({ throughSequence }))
    });
    const view = await renderPage(facade);
    await waitFor(() => expect(facade.markMessagesRead).toHaveBeenCalled());
    await enterText(view.container, "Account A only");
    await click(view.container, "Send message");
    auth.user = { ...user("CUSTOMER"), id: "customer-2", email: "customer-2@example.com" };
    await view.rerender();
    messaging.refreshUnread.mockClear();
    await act(async () => {
      pendingRead.resolve({ throughSequence: "9007199254740993" });
      pendingSend.resolve({ message: message({ body: "Account A only" }), conversation: conversation({ status: "ACCEPTED" }) });
    });
    await flush();
    expect(messaging.refreshUnread).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain("Account A only");
    view.cleanup();
  });

  it("reports a failed read advancement and retries on focus", async () => {
    auth.user = user("CUSTOMER");
    const markMessagesRead = vi.fn().mockRejectedValueOnce(new Error("Read sync unavailable")).mockImplementation(async (_id, throughSequence) => ({ throughSequence }));
    const facade = facadeDouble({ loadWorkspace: vi.fn().mockResolvedValue(workspace({ conversation: conversation({ status: "ACCEPTED" }) })), markMessagesRead });
    const view = await renderPage(facade);
    await waitFor(() => expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Read sync unavailable"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(markMessagesRead).toHaveBeenCalledTimes(2));
    view.cleanup();
  });
});

async function renderPage(facade: MessagingFacade, mobile = false) {
  const pageWindow = new Window();
  Object.assign(pageWindow, { matchMedia: () => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.assign(globalThis, { window: pageWindow, document: pageWindow.document, HTMLElement: pageWindow.HTMLElement, Event: pageWindow.Event, KeyboardEvent: pageWindow.KeyboardEvent });
  const container = document.createElement("div"); document.body.append(container); const root: Root = createRoot(container);
  const render = async () => act(async () => root.render(<MessagesPage facade={facade} />));
  await render(); await flush();
  return { container, rerender: async () => { await render(); await flush(); }, cleanup: () => { act(() => root.unmount()); pageWindow.close(); } };
}

function facadeDouble(overrides: Partial<MessagingFacade> = {}): MessagingFacade {
  let listener: ((next: MessagingWorkspace) => void) | undefined;
  const supplied = { loadWorkspace: vi.fn().mockResolvedValue(workspace()), loadConversationPage: vi.fn().mockResolvedValue({ conversations: [], nextCursor: null, syncSequence: "9007199254740993" }), loadOlderMessages: vi.fn().mockResolvedValue({ messages: [], nextSequence: null, hasMore: false }), recoverAfterReconnect: vi.fn(), createMessageRequest: vi.fn(), acceptMessageRequest: vi.fn().mockResolvedValue(conversation({ status: "ACCEPTED", stateVersion: "2" })), declineMessageRequest: vi.fn().mockResolvedValue(conversation({ status: "DECLINED", stateVersion: "2" })), markMessagesRead: vi.fn().mockImplementation(async (_conversationId: string, throughSequence: string) => ({ throughSequence })), archiveConversation: vi.fn().mockImplementation(async () => ({ conversation: conversation({ archivedAt: "2026-08-15T12:00:00.000Z", stateVersion: "2" }), archived: true })), restoreConversation: vi.fn().mockImplementation(async () => ({ conversation: conversation({ archivedAt: null, stateVersion: "3" }), archived: false })), blockConversation: vi.fn().mockImplementation(async () => conversation({ isBlocked: true, stateVersion: "2" })), unblockConversation: vi.fn().mockImplementation(async () => conversation({ isBlocked: false, stateVersion: "3" })), sendMessage: vi.fn(), disconnect: vi.fn(), ...overrides };
  const facade = { ...supplied, subscribe: vi.fn((next: (workspace: MessagingWorkspace) => void) => { listener = next; return () => { listener = undefined; }; }) } as unknown as MessagingFacade & { emitWorkspace(next: MessagingWorkspace): void };
  facade.emitWorkspace = (next) => listener?.(next);
  for (const name of ["acceptMessageRequest", "declineMessageRequest", "blockConversation", "unblockConversation", "archiveConversation", "restoreConversation"] as const) {
    const operation = facade[name] as (...args: never[]) => Promise<ConversationDto | { conversation: ConversationDto }>;
    (facade as unknown as Record<string, unknown>)[name] = vi.fn(async (...args: never[]) => {
      const result = await operation(...args);
      const next = "conversation" in result ? result.conversation : result;
      facade.emitWorkspace(workspace({ conversation: next }));
      return result;
    });
  }
  return facade;
}
function emitWorkspace(facade: MessagingFacade, next: MessagingWorkspace, messages = next.messages) { (facade as MessagingFacade & { emitWorkspace(next: MessagingWorkspace): void }).emitWorkspace({ ...next, messages }); }
function workspace({ conversation: next = conversation() }: { conversation?: ConversationDto } = {}): MessagingWorkspace { return { conversations: [next], messages: next.lastMessage ? [next.lastMessage] : [], unread: { unreadMessages: 1, pendingRequests: 1, total: 2 }, nextConversationCursor: null, lastRestConfirmedSequence: "9007199254740993" }; }
function message(overrides: Partial<MessageDto> = {}): MessageDto { return { id: "message-1", sequence: "9007199254740993", conversationId: "conversation-1", senderUserId: "customer-1", kind: "REQUEST", body: "Could you do this design?", createdAt: "2026-08-15T12:00:00.000Z", ...overrides }; }
function historyMessage(sequence: number): MessageDto { return message({ id: `message-${sequence}`, sequence: String(sequence), kind: "TEXT", body: `Message ${sequence}`, createdAt: "2026-08-15T12:00:00.000Z" }); }
function conversation(overrides: Partial<ConversationDto> = {}): ConversationDto { return { id: "conversation-1", status: "PENDING", counterpart: { userId: "customer-1", displayName: "Jordan Lee", avatarUrl: null }, requestedAt: "2026-08-15T12:00:00.000Z", acceptedAt: null, declinedAt: null, lastMessageAt: "2026-08-15T12:00:00.000Z", lastMessage: message(), unreadCount: 1, archivedAt: null, isBlocked: false, canManageBlock: true, stateVersion: "1", ...overrides }; }
function user(role: AuthUser["role"]): AuthUser { return { id: role === "CUSTOMER" ? "customer-1" : `${role.toLowerCase()}-1`, email: `${role.toLowerCase()}@example.com`, role, fullName: "Account Owner", avatarUrl: null }; }
function liveDouble() { const messageListeners = new Set<(message: MessageDto) => void>(); const conversationListeners = new Set<(conversation: ConversationDto) => void>(); return { connect: vi.fn(), disconnect: vi.fn(), sendMessage: vi.fn(), onMessage: vi.fn((listener: (message: MessageDto) => void) => { messageListeners.add(listener); return () => messageListeners.delete(listener); }), onConversation: vi.fn((listener: (conversation: ConversationDto) => void) => { conversationListeners.add(listener); return () => conversationListeners.delete(listener); }), onUnread: vi.fn(() => vi.fn()), onConnection: vi.fn(() => vi.fn()), emitMessage: (next: MessageDto) => { for (const listener of messageListeners) listener(next); }, emitConversation: (next: ConversationDto) => { for (const listener of conversationListeners) listener(next); } }; }
function buttonNamed(root: ParentNode, name: string) { return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.getAttribute("aria-label") === name || button.textContent?.trim() === name); }
async function click(root: ParentNode, name: string) { await act(async () => buttonNamed(root, name)?.click()); await flush(); }
async function enterText(root: ParentNode, value: string) { const field = root.querySelector<HTMLTextAreaElement>("textarea")!; const pageWindow = field.ownerDocument.defaultView; await act(async () => { Object.getOwnPropertyDescriptor(pageWindow?.HTMLTextAreaElement.prototype ?? {}, "value")?.set?.call(field, value); field.dispatchEvent(new (pageWindow?.Event ?? Event)("input", { bubbles: true })); field.dispatchEvent(new (pageWindow?.Event ?? Event)("change", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function waitFor(assertion: () => void) { for (let attempt = 0; attempt < 30; attempt += 1) { try { assertion(); return; } catch { await flush(); } } assertion(); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; }); return { promise, resolve, reject }; }
