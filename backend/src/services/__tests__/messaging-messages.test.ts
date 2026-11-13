import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagingModel, MessagingTransactionStore } from "../../models/messaging.model";
import { createMessagingService } from "../messaging.service";

const customer = { id: "customer-1", role: "CUSTOMER" as const };
const tech = { id: "tech-1", role: "TECH" as const };
const conversationId = "conversation-1";
const now = new Date("2026-08-15T12:00:00.000Z");
const input = {
  conversationId,
  body: "Could you fit me in on Saturday?",
  clientRequestId: "request-2"
};

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-2",
    sequence: 42n,
    conversationId,
    senderUserId: customer.id,
    kind: "TEXT" as const,
    body: input.body,
    createdAt: now,
    ...overrides
  };
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    customerId: customer.id,
    techProfileId: "profile-1",
    status: "ACCEPTED" as const,
    requestedAt: new Date("2026-08-10T12:00:00.000Z"),
    acceptedAt: new Date("2026-08-11T12:00:00.000Z"),
    declinedAt: null,
    lastMessageAt: now,
    counterpart: { userId: tech.id, displayName: "Maya", avatarUrl: null },
    lastMessage: message(),
    unreadCount: 0,
    archivedAt: null,
    isBlocked: false,
    stateVersion: 1n,
    ...overrides
  };
}

const store = {
  findRequestContext: vi.fn(),
  findConversationAccess: vi.fn(),
  findMessageByClientRequestId: vi.fn(),
  createRequest: vi.fn(),
  transitionRequestStatus: vi.fn(),
  insertBlock: vi.fn(),
  deleteBlock: vi.fn(),
  setParticipantArchived: vi.fn(),
  advanceReadCursor: vi.fn(),
  createAcceptedMessage: vi.fn(),
  createRecipientDelivery: vi.fn()
};

const telemetry = {
  recordWrite: vi.fn(),
  recordSocket: vi.fn(),
  recordCatchUp: vi.fn(),
  recordDeliveryHealth: vi.fn(),
  recordDelivery: vi.fn(),
  recordFanOut: vi.fn(),
  recordListener: vi.fn(),
  recordRateLimit: vi.fn()
};

function service() {
  const model = {
    withSerializableTransaction: async <T>(work: (transaction: MessagingTransactionStore) => Promise<T>) =>
      work(store as unknown as MessagingTransactionStore),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    syncMessages: vi.fn(),
    getUnreadSummary: vi.fn(),
    getRealtimeMessage: vi.fn(),
    getRealtimeConversation: vi.fn()
  } as unknown as MessagingModel;
  return { messaging: createMessagingService(model, telemetry), model };
}

describe("messaging messages and recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation(),
      participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 41n, archivedAt: null },
      isBlocked: false,
      canonicalPair: { customerUserId: customer.id, techUserId: tech.id }
    });
    store.findMessageByClientRequestId.mockResolvedValue(null);
    store.createAcceptedMessage.mockResolvedValue({ conversation: conversation(), message: message() });
  });

  it("acknowledges only a committed accepted-conversation message", async () => {
    const { messaging } = service();

    await expect(messaging.sendMessage(customer, input, now)).resolves.toMatchObject({
      replayed: false,
      message: { id: "message-2", sequence: "42", body: input.body },
      conversation: { id: conversationId }
    });
    expect(store.createAcceptedMessage).toHaveBeenCalledWith(expect.objectContaining({
      clearRecipientArchive: true,
      advanceSenderReadCursor: true
    }));
  });

  it("rejects a stale tech participant after profile ownership changes", async () => {
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation(),
      participant: { userId: tech.id, role: "TECH", lastReadSequence: 41n, archivedAt: null },
      isBlocked: false,
      canonicalPair: null
    });

    await expect(service().messaging.sendMessage(tech, input, now)).rejects.toMatchObject({ code: "not_found" });
    expect(store.createAcceptedMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", conversation({ status: "PENDING", acceptedAt: null }), false, "request_not_accepted"],
    ["declined", conversation({ status: "DECLINED", declinedAt: now }), false, "request_not_accepted"],
    ["blocked", conversation(), true, "messaging_blocked"]
  ])("rejects %s conversations before persisting a text", async (_label, current, isBlocked, code) => {
    store.findConversationAccess.mockResolvedValue({
      conversation: current,
      participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 41n, archivedAt: null },
      isBlocked,
      canonicalPair: { customerUserId: customer.id, techUserId: tech.id }
    });

    await expect(service().messaging.sendMessage(customer, input, now)).rejects.toMatchObject({ code });
    expect(store.createAcceptedMessage).not.toHaveBeenCalled();
  });

  it("replays the original text for an idempotent retry", async () => {
    store.findMessageByClientRequestId.mockResolvedValue({ conversation: conversation(), message: message() });

    await expect(service().messaging.sendMessage(customer, input, now)).resolves.toMatchObject({
      replayed: true,
      message: { id: "message-2", sequence: "42" }
    });
    expect(store.createAcceptedMessage).not.toHaveBeenCalled();
  });

  it("recovers the committed winner after an idempotency uniqueness race", async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError("duplicate message", { code: "P2002", clientVersion: "test" });
    store.createAcceptedMessage.mockRejectedValueOnce(uniqueConflict);
    store.findMessageByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ conversation: conversation(), message: message() });

    await expect(service().messaging.sendMessage(customer, input, now)).resolves.toMatchObject({ replayed: true, message: { id: "message-2" } });
  });

  it("rejects a request ID already bound to another conversation", async () => {
    store.findMessageByClientRequestId.mockResolvedValue({
      conversation: conversation({ id: "conversation-2" }),
      message: message({ conversationId: "conversation-2" })
    });

    await expect(service().messaging.sendMessage(customer, input, now)).rejects.toMatchObject({ code: "client_request_id_reused" });
    expect(store.createAcceptedMessage).not.toHaveBeenCalled();
  });

  it("rejects a different-conversation winner after an idempotency uniqueness race", async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError("duplicate message", { code: "P2002", clientVersion: "test" });
    store.createAcceptedMessage.mockRejectedValueOnce(uniqueConflict);
    store.findMessageByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        conversation: conversation({ id: "conversation-2" }),
        message: message({ conversationId: "conversation-2" })
      });

    await expect(service().messaging.sendMessage(customer, input, now)).rejects.toMatchObject({ code: "client_request_id_reused" });
  });

  it("writes sender and recipient realtime rows plus a recipient email row without the message body", async () => {
    await service().messaging.sendMessage(customer, input, now);

    expect(store.createRecipientDelivery).toHaveBeenCalledTimes(3);
    expect(store.createRecipientDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKind: "REALTIME_MESSAGE",
      recipientUserId: customer.id,
      payload: { conversationId, messageId: "message-2" }
    }));
    expect(store.createRecipientDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKind: "REALTIME_MESSAGE",
      recipientUserId: tech.id,
      payload: { conversationId, messageId: "message-2" }
    }));
    expect(store.createRecipientDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKind: "EMAIL_MESSAGE",
      recipientUserId: tech.id,
      payload: { conversationId, messageId: "message-2" },
      nextAttemptAt: new Date("2026-08-15T12:02:00.000Z")
    }));
    expect(store.createRecipientDelivery.mock.calls
      .map(([delivery]) => delivery)
      .filter((delivery) => delivery.deliveryKind === "REALTIME_MESSAGE")
      .every((delivery) => delivery.nextAttemptAt === undefined)).toBe(true);
  });

  it("advances read cursors monotonically only through a visible message", async () => {
    await expect(service().messaging.markRead(customer, conversationId, "42")).resolves.toEqual({ throughSequence: "42" });
    expect(store.advanceReadCursor).toHaveBeenCalledWith(customer.id, conversationId, 42n, expect.any(Date));
  });

  it("does not let a caller advance beyond the conversation's latest visible message", async () => {
    await expect(service().messaging.markRead(customer, conversationId, "43")).rejects.toMatchObject({ code: "read_cursor_invalid" });
    expect(store.advanceReadCursor).not.toHaveBeenCalled();
  });

  it("loads participant-scoped pages and serializes all durable sequences", async () => {
    const { messaging, model } = service();
    (model.listConversations as ReturnType<typeof vi.fn>).mockResolvedValue({
      conversations: [conversation()], nextCursor: "cursor", syncSequence: 42n
    });
    (model.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      messages: [message()], nextSequence: 42n, hasMore: true
    });
    (model.syncMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      messages: [message()], nextSequence: null, hasMore: false
    });
    (model.getUnreadSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ unreadMessages: 1, pendingRequests: 2, total: 3 });

    await expect(messaging.listConversations(customer, { archived: false, limit: 30 })).resolves.toMatchObject({ syncSequence: "42" });
    await expect(messaging.listMessages(customer, conversationId, { beforeSequence: "43", limit: 50 })).resolves.toMatchObject({
      messages: [{ sequence: "42" }], nextSequence: "42", hasMore: true
    });
    await expect(messaging.syncMessages(customer, { afterSequence: "41", limit: 100 })).resolves.toMatchObject({
      messages: [{ sequence: "42" }], hasMore: false, unread: { total: 3 }
    });
  });

  it("records successful and failed catch-up pages without message content", async () => {
    const { messaging, model } = service();
    (model.syncMessages as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ messages: [message()], nextSequence: 42n, hasMore: false })
      .mockRejectedValueOnce(new Error("database unavailable"));
    (model.getUnreadSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ unreadMessages: 1, pendingRequests: 0, total: 1 });

    await messaging.syncMessages(customer, { afterSequence: "41", limit: 100 });
    await expect(messaging.syncMessages(customer, { afterSequence: "42", limit: 100 })).rejects.toThrow("database unavailable");

    expect(telemetry.recordCatchUp).toHaveBeenNthCalledWith(1, expect.objectContaining({ actorUserId: customer.id, outcome: "completed", messageCount: 1 }));
    expect(telemetry.recordCatchUp).toHaveBeenNthCalledWith(2, expect.objectContaining({ actorUserId: customer.id, outcome: "failed", messageCount: 0 }));
    expect(JSON.stringify(telemetry.recordCatchUp.mock.calls)).not.toContain(input.body);
  });

  it("hides a non-member conversation as not found when loading history", async () => {
    store.findConversationAccess.mockResolvedValue(null);

    await expect(service().messaging.listMessages(customer, conversationId, { limit: 50 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("hydrates a realtime identifier through participant-scoped model reads without changing a read cursor", async () => {
    const { messaging, model } = service();
    (model.getRealtimeMessage as ReturnType<typeof vi.fn>).mockResolvedValue(message());
    (model.getRealtimeConversation as ReturnType<typeof vi.fn>).mockResolvedValue(conversation());
    (model.getUnreadSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ unreadMessages: 1, pendingRequests: 0, total: 1 });

    await expect(messaging.hydrateRealtimeEvent(customer.id, {
      kind: "message",
      conversationId,
      messageId: "message-2"
    })).resolves.toEqual({
      message: expect.objectContaining({ id: "message-2", sequence: "42" }),
      conversation: expect.objectContaining({ id: conversationId, lastMessage: expect.objectContaining({ sequence: "42" }) }),
      unread: { unreadMessages: 1, pendingRequests: 0, total: 1 }
    });
    expect(model.getRealtimeMessage).toHaveBeenCalledWith(customer.id, conversationId, "message-2");
    expect(model.getRealtimeConversation).toHaveBeenCalledWith(customer.id, conversationId);
    expect(model.getUnreadSummary).toHaveBeenCalledWith(customer.id);
    expect(store.advanceReadCursor).not.toHaveBeenCalled();
  });
});
