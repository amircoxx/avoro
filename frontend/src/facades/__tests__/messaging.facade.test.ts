import { describe, expect, it, vi } from "vitest";
import type { ConversationDto, MessageDto, UnreadSummaryDto } from "@/services/api";
import type { MessagingSocket } from "@/services/messaging-socket";
import { createMessagingFacade, type MessagingWorkspace } from "../messaging.facade";

const unread: UnreadSummaryDto = { unreadMessages: 1, pendingRequests: 0, total: 1 };
const message = (sequence: string): MessageDto => ({
  id: `message-${sequence}`,
  sequence,
  conversationId: "conversation-1",
  senderUserId: sequence === "42" ? "tech-1" : "customer-1",
  kind: "TEXT",
  body: `Message ${sequence}`,
  createdAt: `2026-08-14T12:${sequence}:00.000Z`
});
const conversation = (lastMessage: MessageDto | null = message("41")): ConversationDto => ({
  id: "conversation-1",
  status: "ACCEPTED",
  counterpart: { userId: "tech-1", displayName: "Jordan", avatarUrl: null },
  requestedAt: "2026-08-14T11:00:00.000Z",
  acceptedAt: "2026-08-14T11:01:00.000Z",
  declinedAt: null,
  lastMessageAt: "2026-08-14T12:00:00.000Z",
  lastMessage,
  unreadCount: 1,
  archivedAt: null,
  isBlocked: false,
  canManageBlock: true,
  stateVersion: "1"
});

function socketDouble(): MessagingSocket & {
  emitMessage(message: MessageDto): void;
  emitConversation(conversation: ConversationDto): void;
  emitUnread(summary: UnreadSummaryDto): void;
  messageSubscriptionCount(): number;
} {
  const messages = new Set<(next: MessageDto) => void>();
  const conversations = new Set<(next: ConversationDto) => void>();
  const unreadListeners = new Set<(next: UnreadSummaryDto) => void>();
  const connections = new Set<(state: "connected" | "reconnecting" | "disconnected" | "session-invalid") => void>();
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    onMessage(listener) { messages.add(listener); return () => messages.delete(listener); },
    onConversation(listener) { conversations.add(listener); return () => conversations.delete(listener); },
    onUnread(listener) { unreadListeners.add(listener); return () => unreadListeners.delete(listener); },
    onConnection(listener) { connections.add(listener); return () => connections.delete(listener); },
    emitMessage(next) { for (const listener of messages) listener(next); },
    emitConversation(next) { for (const listener of conversations) listener(next); },
    emitUnread(next) { for (const listener of unreadListeners) listener(next); },
    messageSubscriptionCount() { return messages.size; }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("messaging facade", () => {
  it("buffers socket events before the inbox snapshot and never advances recovery from a socket sequence", async () => {
    const socket = socketDouble();
    socket.connect = vi.fn(() => socket.emitMessage(message("42")));
    const loadConversations = vi.fn().mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "41" });
    const facade = createMessagingFacade({ socket, loadConversations, loadUnreadSummary: vi.fn().mockResolvedValue(unread) });

    await expect(facade.loadWorkspace()).resolves.toMatchObject({
      conversations: [conversation()],
      messages: [message("41"), message("42")],
      unread,
      lastRestConfirmedSequence: "41"
    });
    expect(socket.connect).toHaveBeenCalledBefore(loadConversations);
  });

  it("reloads the inbox before paginated REST recovery and retains out-of-order socket messages exactly once", async () => {
    const socket = socketDouble();
    const loadConversations = vi.fn().mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "43" });
    const sync = vi.fn()
      .mockResolvedValueOnce({ messages: [message("42")], nextSequence: "42", hasMore: true, unread })
      .mockResolvedValueOnce({ messages: [message("43")], nextSequence: "43", hasMore: false, unread });
    const facade = createMessagingFacade({ socket, loadConversations, syncMessages: sync, loadUnreadSummary: vi.fn().mockResolvedValue(unread) });
    socket.emitMessage(message("43"));
    socket.emitMessage(message("42"));

    await expect(facade.recoverAfterReconnect("41")).resolves.toMatchObject({
      conversations: [conversation()],
      messages: [message("41"), message("42"), message("43")],
      unread,
      lastRestConfirmedSequence: "43"
    });
    expect(loadConversations).toHaveBeenCalledBefore(sync);
    expect(sync).toHaveBeenNthCalledWith(1, { afterSequence: "41", limit: 100 });
    expect(sync).toHaveBeenNthCalledWith(2, { afterSequence: "42", limit: 100 });
  });

  it("serializes overlapping recoveries, keeps the REST cursor monotonic, and drains a live event once", async () => {
    const socket = socketDouble();
    const firstInbox = deferred<{ conversations: ConversationDto[]; nextCursor: null; syncSequence: string }>();
    const secondInbox = deferred<{ conversations: ConversationDto[]; nextCursor: null; syncSequence: string }>();
    secondInbox.resolve({ conversations: [conversation()], nextCursor: null, syncSequence: "40" });
    const loadConversations = vi.fn()
      .mockReturnValueOnce(firstInbox.promise)
      .mockResolvedValueOnce({ conversations: [], nextCursor: null, syncSequence: "42" })
      .mockReturnValueOnce(secondInbox.promise)
      .mockResolvedValueOnce({ conversations: [], nextCursor: null, syncSequence: "42" });
    const sync = vi.fn()
      .mockResolvedValueOnce({ messages: [message("42")], nextSequence: "42", hasMore: true, unread })
      .mockResolvedValueOnce({ messages: [], nextSequence: null, hasMore: false, unread })
      .mockResolvedValueOnce({ messages: [], nextSequence: null, hasMore: false, unread });
    const facade = createMessagingFacade({ socket, loadConversations, syncMessages: sync, loadUnreadSummary: vi.fn().mockResolvedValue(unread) });

    const firstRecovery = facade.recoverAfterReconnect("41");
    const secondRecovery = facade.recoverAfterReconnect("40");
    expect(loadConversations).toHaveBeenCalledTimes(1);
    socket.emitMessage(message("43"));
    firstInbox.resolve({ conversations: [conversation()], nextCursor: null, syncSequence: "42" });

    await expect(firstRecovery).resolves.toMatchObject({
      messages: [message("41"), message("42"), message("43")],
      lastRestConfirmedSequence: "42"
    });
    await expect(secondRecovery).resolves.toMatchObject({
      messages: [message("41"), message("42"), message("43")],
      lastRestConfirmedSequence: "42"
    });
    expect(sync).toHaveBeenLastCalledWith({ afterSequence: "42", limit: 100 });
  });

  it("reattaches one live subscription before a reusable facade's next inbox load", async () => {
    const socket = socketDouble();
    const secondInbox = deferred<{ conversations: ConversationDto[]; nextCursor: null; syncSequence: string }>();
    const loadConversations = vi.fn()
      .mockResolvedValueOnce({ conversations: [conversation()], nextCursor: null, syncSequence: "41" })
      .mockReturnValueOnce(secondInbox.promise);
    const facade = createMessagingFacade({ socket, loadConversations, loadUnreadSummary: vi.fn().mockResolvedValue(unread) });

    await facade.loadWorkspace();
    facade.disconnect();
    const secondLoad = facade.loadWorkspace();
    expect(socket.messageSubscriptionCount()).toBe(1);
    socket.emitMessage(message("42"));
    secondInbox.resolve({ conversations: [conversation()], nextCursor: null, syncSequence: "41" });

    await expect(secondLoad).resolves.toMatchObject({ messages: [message("41"), message("42")] });
    expect(socket.messageSubscriptionCount()).toBe(1);
  });

  it("merges older history and lifecycle/participant changes through their typed transport actions", async () => {
    const socket = socketDouble();
    const accepted = conversation(message("43"));
    const sendMessage = vi.fn().mockResolvedValue({ message: message("44"), conversation: accepted });
    const accept = vi.fn().mockResolvedValue(accepted);
    const block = vi.fn().mockResolvedValue({ ...accepted, isBlocked: true });
    const getMessages = vi.fn().mockResolvedValue({ messages: [message("40")], nextSequence: null, hasMore: false });
    const facade = createMessagingFacade({ socket, sendMessage, acceptMessageRequest: accept, blockConversation: block, getMessages });

    await expect(facade.loadOlderMessages("conversation-1", "41")).resolves.toMatchObject({ messages: [message("40")] });
    await expect(facade.acceptMessageRequest("conversation-1")).resolves.toEqual(accepted);
    await expect(facade.blockConversation("conversation-1")).resolves.toMatchObject({ isBlocked: true });
    await expect(facade.sendMessage({ conversationId: "conversation-1", body: "Message 44", clientRequestId: "request-44" })).resolves.toMatchObject({ message: message("44") });
    expect(getMessages).toHaveBeenCalledWith("conversation-1", { beforeSequence: "41", limit: 50 });
    expect(accept).toHaveBeenCalledWith("conversation-1");
    expect(block).toHaveBeenCalledWith("conversation-1");
    expect(sendMessage).toHaveBeenCalledWith({ conversationId: "conversation-1", body: "Message 44", clientRequestId: "request-44" });
  });

  it("publishes recovered canonical workspaces to mounted consumers", async () => {
    const socket = socketDouble();
    const recovered = message("42");
    const facade = createMessagingFacade({
      socket,
      loadConversations: vi.fn().mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "41" }),
      loadUnreadSummary: vi.fn().mockResolvedValue(unread),
      syncMessages: vi.fn().mockResolvedValue({ messages: [recovered], nextSequence: "42", hasMore: false, unread })
    });
    const published: MessagingWorkspace[] = [];
    facade.subscribe((workspace) => published.push(workspace));

    await facade.loadWorkspace();
    await facade.recoverAfterReconnect("41");

    expect(published.at(-1)?.messages).toEqual([message("41"), recovered]);
    expect(published.at(-1)?.lastRestConfirmedSequence).toBe("42");
  });

  it("publishes a newly created request into the shared workspace before navigation", async () => {
    const socket = socketDouble();
    const requestMessage = { ...message("42"), kind: "REQUEST" as const, body: "Could you help with an overlay?" };
    const pending = { ...conversation(requestMessage), status: "PENDING" as const, acceptedAt: null, stateVersion: "2" };
    const createRequest = vi.fn().mockResolvedValue({ conversation: pending, message: requestMessage });
    const facade = createMessagingFacade({ socket, createMessageRequest: createRequest });
    const snapshots: MessagingWorkspace[] = [];
    facade.subscribe((workspace) => snapshots.push(workspace));

    await facade.createMessageRequest({ techProfileId: "tech-1", body: "Could you help with an overlay?", clientRequestId: "request-42" });

    expect(createRequest).toHaveBeenCalledWith({ techProfileId: "tech-1", body: "Could you help with an overlay?", clientRequestId: "request-42" });
    expect(snapshots.at(-1)).toMatchObject({ conversations: [pending], messages: [requestMessage] });
  });

  it("loads authoritative filtered conversation pages and merges cursor pages", async () => {
    const socket = socketDouble();
    const second = { ...conversation(message("42")), id: "conversation-2", archivedAt: "2026-08-15T12:00:00.000Z" };
    const loadConversations = vi.fn()
      .mockResolvedValueOnce({ conversations: [conversation()], nextCursor: "cursor-2", syncSequence: "41" })
      .mockResolvedValueOnce({ conversations: [second], nextCursor: null, syncSequence: "42" });
    const facade = createMessagingFacade({ socket, loadConversations });

    await facade.loadConversationPage({ archived: true, limit: 30 });
    const page = await facade.loadConversationPage({ archived: true, cursor: "cursor-2", limit: 30 });

    expect(loadConversations).toHaveBeenNthCalledWith(1, { archived: true, limit: 30 });
    expect(loadConversations).toHaveBeenNthCalledWith(2, { archived: true, cursor: "cursor-2", limit: 30 });
    expect(page.nextCursor).toBeNull();
  });

  it("never advances recovery from a filtered inbox high-water mark", async () => {
    const socket = socketDouble();
    const loadConversations = vi.fn()
      .mockResolvedValueOnce({ conversations: [conversation()], nextCursor: null, syncSequence: "41" })
      .mockResolvedValueOnce({ conversations: [], nextCursor: null, syncSequence: "99" })
      .mockResolvedValue({ conversations: [], nextCursor: null, syncSequence: "99" });
    const sync = vi.fn().mockResolvedValue({ messages: [message("42")], nextSequence: "42", hasMore: false, unread });
    const facade = createMessagingFacade({ socket, loadConversations, loadUnreadSummary: vi.fn().mockResolvedValue(unread), syncMessages: sync });

    await facade.loadWorkspace();
    await facade.loadConversationPage({ archived: true, limit: 30 });
    await facade.recoverAfterReconnect("41");

    expect(sync).toHaveBeenCalledWith({ afterSequence: "41", limit: 100 });
  });

  it("advances recovery from only the initial workspace snapshot", async () => {
    const socket = socketDouble();
    const loadConversations = vi.fn()
      .mockResolvedValueOnce({ conversations: [conversation()], nextCursor: null, syncSequence: "41" })
      .mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "99" });
    const sync = vi.fn().mockResolvedValue({ messages: [message("42")], nextSequence: "42", hasMore: false, unread });
    const facade = createMessagingFacade({ socket, loadConversations, loadUnreadSummary: vi.fn().mockResolvedValue(unread), syncMessages: sync });

    await facade.loadWorkspace();
    await facade.loadWorkspace();
    await facade.recoverAfterReconnect("41");

    expect(sync).toHaveBeenCalledWith({ afterSequence: "41", limit: 100 });
  });

  it("fully reconciles paginated active and archived conversation state on reconnect", async () => {
    const socket = socketDouble();
    const archived = { ...conversation(), archivedAt: "2026-08-15T12:00:00.000Z", stateVersion: "2" };
    const older = { ...conversation(), id: "conversation-2", stateVersion: "1" };
    const accepted = { ...older, status: "ACCEPTED" as const, acceptedAt: "2026-08-16T12:00:00.000Z", stateVersion: "3" };
    const pageOne = { ...conversation(), id: "conversation-3", stateVersion: "1" };
    const loadConversations = vi.fn()
      .mockResolvedValueOnce({ conversations: [conversation(), older], nextCursor: null, syncSequence: "41" })
      .mockResolvedValueOnce({ conversations: [pageOne], nextCursor: "active-2", syncSequence: "99" })
      .mockResolvedValueOnce({ conversations: [accepted], nextCursor: null, syncSequence: "99" })
      .mockResolvedValueOnce({ conversations: [archived], nextCursor: null, syncSequence: "99" });
    const facade = createMessagingFacade({
      socket,
      loadConversations,
      loadUnreadSummary: vi.fn().mockResolvedValue(unread),
      syncMessages: vi.fn().mockResolvedValue({ messages: [], nextSequence: null, hasMore: false, unread })
    });

    await facade.loadWorkspace();
    const recovered = await facade.recoverAfterReconnect("41");

    expect(loadConversations).toHaveBeenNthCalledWith(2, { archived: false, limit: 30 });
    expect(loadConversations).toHaveBeenNthCalledWith(3, { archived: false, limit: 30, cursor: "active-2" });
    expect(loadConversations).toHaveBeenNthCalledWith(4, { archived: true, limit: 30 });
    expect(recovered.conversations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "conversation-1", archivedAt: archived.archivedAt }),
      expect.objectContaining({ id: "conversation-2", status: "ACCEPTED", stateVersion: "3" })
    ]));
  });

  it("rejects stale conversation events and publishes one recency-safe snapshot", async () => {
    const socket = socketDouble();
    const facade = createMessagingFacade({ socket, loadConversations: vi.fn().mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "41" }), loadUnreadSummary: vi.fn().mockResolvedValue(unread) });
    const snapshots: MessagingWorkspace[] = [];
    facade.subscribe((workspace) => snapshots.push(workspace));
    await facade.loadWorkspace();
    const accepted = { ...conversation(message("42")), status: "ACCEPTED" as const, acceptedAt: "2026-08-15T12:00:00.000Z", stateVersion: "2" };
    socket.emitConversation(accepted);
    socket.emitConversation(conversation(message("41")));

    expect(snapshots.at(-1)?.conversations[0]?.status).toBe("ACCEPTED");
    expect(snapshots.at(-1)?.conversations[0]?.lastMessage?.sequence).toBe("42");
  });

  it("uses stateVersion to reject reversed participant and block snapshots at the same message sequence", async () => {
    const socket = socketDouble();
    const current = { ...conversation(), stateVersion: "8", archivedAt: null, isBlocked: false, unreadCount: 0 };
    const facade = createMessagingFacade({ socket, loadConversations: vi.fn().mockResolvedValue({ conversations: [current], nextCursor: null, syncSequence: "41" }), loadUnreadSummary: vi.fn().mockResolvedValue(unread) });
    const snapshots: MessagingWorkspace[] = [];
    facade.subscribe((workspace) => snapshots.push(workspace));
    await facade.loadWorkspace();

    socket.emitConversation({ ...current, stateVersion: "7", archivedAt: "2026-08-15T12:00:00.000Z", isBlocked: true, unreadCount: 2 });

    expect(snapshots.at(-1)?.conversations[0]).toMatchObject({ stateVersion: "8", archivedAt: null, isBlocked: false, unreadCount: 0 });
  });

  it("publishes canonical post-mutation archive and restore timestamps", async () => {
    const socket = socketDouble();
    const archived = { ...conversation(), archivedAt: "2026-08-15T12:00:00.000Z", stateVersion: "2" };
    const restored = { ...archived, archivedAt: null, stateVersion: "3" };
    const facade = createMessagingFacade({
      socket,
      loadConversations: vi.fn().mockResolvedValue({ conversations: [conversation()], nextCursor: null, syncSequence: "41" }),
      loadUnreadSummary: vi.fn().mockResolvedValue(unread),
      archiveConversation: vi.fn().mockResolvedValue({ conversation: archived, archived: true }),
      restoreConversation: vi.fn().mockResolvedValue({ conversation: restored, archived: false })
    });
    const snapshots: MessagingWorkspace[] = [];
    facade.subscribe((workspace) => snapshots.push(workspace));
    await facade.loadWorkspace();

    await facade.archiveConversation("conversation-1");
    expect(snapshots.at(-1)?.conversations[0]?.archivedAt).toBe("2026-08-15T12:00:00.000Z");
    await facade.restoreConversation("conversation-1");
    expect(snapshots.at(-1)?.conversations[0]?.archivedAt).toBeNull();
  });
});
