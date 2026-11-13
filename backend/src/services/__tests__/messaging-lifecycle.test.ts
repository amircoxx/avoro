import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagingModel, MessagingTransactionStore } from "../../models/messaging.model";
import { toApiError } from "../../utils/api-response";
import { createMessagingService } from "../messaging.service";

const customer = { id: "customer-1", role: "CUSTOMER" as const };
const tech = { id: "tech-1", role: "TECH" as const };
const otherTech = { id: "tech-2", role: "TECH" as const };
const techProfileId = "profile-1";
const conversationId = "conversation-1";
const now = new Date("2026-08-15T12:00:00.000Z");
const input = {
  techProfileId,
  body: "Hello, I would like to book an appointment.",
  clientRequestId: "request-1"
};

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    customerId: customer.id,
    techProfileId,
    status: "PENDING" as const,
    requestedAt: new Date("2026-08-10T12:00:00.000Z"),
    acceptedAt: null,
    declinedAt: null,
    lastMessageAt: new Date("2026-08-10T12:00:00.000Z"),
    counterpart: { userId: tech.id, displayName: "Maya", avatarUrl: null },
    lastMessage: null,
    unreadCount: 0,
    archivedAt: null,
    isBlocked: false,
    stateVersion: 1n,
    ...overrides
  };
}

function message() {
  return {
    id: "message-1",
    sequence: 1n,
    conversationId,
    senderUserId: customer.id,
    kind: "REQUEST" as const,
    body: input.body,
    createdAt: now
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
      work(store as unknown as MessagingTransactionStore)
  } as MessagingModel;
  return createMessagingService(model, telemetry);
}

describe("messaging request lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: null,
      isBlocked: false,
      pairIsCanonical: true
    });
    store.findMessageByClientRequestId.mockResolvedValue(null);
    store.createRequest.mockResolvedValue({ conversation: conversation(), message: message() });
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation(),
      participant: { userId: tech.id, role: "TECH", lastReadSequence: 0n, archivedAt: null },
      isBlocked: false,
      canonicalPair: { customerUserId: customer.id, techUserId: tech.id }
    });
    store.transitionRequestStatus.mockResolvedValue(conversation({ status: "ACCEPTED", acceptedAt: now }));
    store.setParticipantArchived.mockResolvedValue(true);
  });

  it("creates one pending request and both participant rows atomically", async () => {
    const result = await service().createRequest(customer.id, input, now);

    expect(store.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      customerId: customer.id,
      techProfileId: input.techProfileId,
      body: input.body,
      clientRequestId: input.clientRequestId,
      senderReadThroughNewMessage: true
    }));
    expect(result.replayed).toBe(false);
    expect(result.conversation).toMatchObject({ id: conversationId, status: "PENDING" });
    expect(result.message).toMatchObject({ id: "message-1", sequence: "1" });
  });

  it("rejects a second pending request and reports the exact cooldown boundary", async () => {
    const pendingContext = {
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation(),
      isBlocked: false,
      pairIsCanonical: true
    };
    const declinedAt = new Date("2026-08-01T12:00:00.000Z");
    store.findRequestContext
      .mockResolvedValueOnce(pendingContext)
      .mockResolvedValueOnce({ ...pendingContext, conversation: conversation({ status: "DECLINED", declinedAt }) });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "request_pending" });
    const cooldown = await service().createRequest(customer.id, input, now).catch((error: unknown) => error);
    expect(cooldown).toMatchObject({ code: "request_cooldown" });
    expect(toApiError(cooldown).body).toMatchObject({
      error: { details: { nextAllowedAt: "2026-08-31T12:00:00.000Z" } }
    });
  });

  it("blocks a new request at the exact thirty-day cooldown boundary", async () => {
    const declinedAt = new Date("2026-08-01T12:00:00.000Z");
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation({ status: "DECLINED", declinedAt }),
      isBlocked: false,
      pairIsCanonical: true
    });

    await expect(service().createRequest(customer.id, input, new Date("2026-08-31T12:00:00.000Z"))).rejects.toMatchObject({
      code: "request_cooldown",
      details: { nextAllowedAt: "2026-08-31T12:00:00.000Z" }
    });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("does not let a new request reset an accepted conversation to pending", async () => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation({ status: "ACCEPTED", acceptedAt: now }),
      isBlocked: false,
      pairIsCanonical: true
    });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "request_pending" });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("replays a matching request before rejecting the now-pending conversation", async () => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation(),
      isBlocked: false,
      pairIsCanonical: true
    });
    store.findMessageByClientRequestId.mockResolvedValue({ conversation: conversation(), message: message() });

    await expect(service().createRequest(customer.id, input, now)).resolves.toMatchObject({
      replayed: true,
      conversation: { id: conversationId },
      message: { id: "message-1" }
    });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("finds an authorized matching replay before the transport consumes a new-request budget", async () => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation(),
      isBlocked: false,
      pairIsCanonical: true
    });
    store.findMessageByClientRequestId.mockResolvedValue({ conversation: conversation(), message: message() });

    await expect(service().findAuthorizedRequestReplay(customer.id, input)).resolves.toMatchObject({
      replayed: true,
      conversation: { id: conversationId },
      message: { id: "message-1" }
    });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("applies block checks before returning a matching request replay", async () => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: conversation(),
      isBlocked: true,
      pairIsCanonical: true
    });
    store.findMessageByClientRequestId.mockResolvedValue({ conversation: conversation(), message: message() });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "messaging_blocked" });
    expect(store.findMessageByClientRequestId).not.toHaveBeenCalled();
  });

  it("rejects a client request ID reused for a different tech profile", async () => {
    const otherProfileId = "profile-2";
    store.findMessageByClientRequestId.mockResolvedValue({
      conversation: conversation({ techProfileId: otherProfileId }),
      message: message()
    });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "client_request_id_reused" });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("loads the winning request after an idempotency uniqueness race", async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError("duplicate request", {
      code: "P2002",
      clientVersion: "test"
    });
    store.findMessageByClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ conversation: conversation(), message: message() });
    store.createRequest.mockRejectedValueOnce(uniqueConflict);

    await expect(service().createRequest(customer.id, input, now)).resolves.toMatchObject({ replayed: true, message: { id: "message-1" } });
    expect(store.findMessageByClientRequestId).toHaveBeenCalledTimes(2);
  });

  it("retries the complete request transaction at most three times after a serializable conflict", async () => {
    const serializableConflict = new Prisma.PrismaClientKnownRequestError("retry transaction", {
      code: "P2034",
      clientVersion: "test"
    });
    const withSerializableTransaction = vi.fn(async <T>(work: (transaction: MessagingTransactionStore) => Promise<T>) =>
      work(store as unknown as MessagingTransactionStore)
    );
    const model = { withSerializableTransaction } as unknown as MessagingModel;
    store.createRequest.mockRejectedValue(serializableConflict);

    await expect(createMessagingService(model, telemetry).createRequest(customer.id, input, now)).rejects.toBe(serializableConflict);
    expect(withSerializableTransaction).toHaveBeenCalledTimes(3);
    expect(store.createRequest).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["customer contacts their own profile", { techUserId: customer.id, techPublished: true }, "forbidden"],
    ["profile is unpublished", { techUserId: tech.id, techPublished: false }, "not_found"]
  ])("rejects a request when %s", async (_label, context, code) => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      conversation: null,
      isBlocked: false,
      pairIsCanonical: true,
      ...context
    });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code });
    expect(store.createRequest).not.toHaveBeenCalled();
  });

  it("hides a directional block without revealing which participant created it", async () => {
    store.findRequestContext.mockResolvedValue({
      customerId: customer.id,
      techProfileId,
      techUserId: tech.id,
      techPublished: true,
      conversation: null,
      isBlocked: true,
      pairIsCanonical: true
    });

    await expect(service().createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "messaging_blocked" });
  });

  it("allows only the owning tech participant to accept a request with compare-and-set", async () => {
    const result = await service().acceptRequest(tech, conversationId, now);

    expect(store.transitionRequestStatus).toHaveBeenCalledWith({
      actorUserId: tech.id,
      conversationId,
      status: "ACCEPTED",
      now
    });
    expect(result).toMatchObject({ id: conversationId, status: "ACCEPTED" });
  });

  it("requires a pending compare-and-set result when declining", async () => {
    store.transitionRequestStatus.mockResolvedValue(null);

    await expect(service().declineRequest(tech, conversationId, now)).rejects.toMatchObject({ code: "request_not_pending" });
  });

  it.each(["acceptRequest", "declineRequest"] as const)("rejects %s after tech-profile ownership changes", async (method) => {
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation(),
      participant: { userId: tech.id, role: "TECH", lastReadSequence: 0n, archivedAt: null },
      isBlocked: false,
      canonicalPair: null
    });

    await expect(service()[method](tech, conversationId, now)).rejects.toMatchObject({ code: "not_found" });
    expect(store.transitionRequestStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["customer", customer, { userId: customer.id, role: "CUSTOMER" as const, lastReadSequence: 0n, archivedAt: null }],
    ["non-owner tech", otherTech, { userId: otherTech.id, role: "CUSTOMER" as const, lastReadSequence: 0n, archivedAt: null }]
  ])("forbids %s request decisions", async (_label, actor, participant) => {
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation(),
      participant,
      isBlocked: false,
      canonicalPair: { customerUserId: customer.id, techUserId: tech.id }
    });

    await expect(service().acceptRequest(actor, conversationId, now)).rejects.toMatchObject({
      code: actor.id === customer.id ? "forbidden" : "not_found"
    });
    expect(store.transitionRequestStatus).not.toHaveBeenCalled();
  });

  it.each(["acceptRequest", "declineRequest"] as const)("rejects %s when either direction is blocked", async (method) => {
    store.findConversationAccess.mockResolvedValue({
      conversation: conversation({ isBlocked: true }),
      participant: { userId: tech.id, role: "TECH", lastReadSequence: 0n, archivedAt: null },
      isBlocked: true,
      canonicalPair: { customerUserId: customer.id, techUserId: tech.id }
    });

    await expect(service()[method](tech, conversationId, now)).rejects.toMatchObject({ code: "messaging_blocked" });
  });

  it("archives only the caller's participant row", async () => {
    store.findConversationAccess
      .mockResolvedValueOnce({ conversation: conversation(), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: null }, isBlocked: false, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } })
      .mockResolvedValueOnce({ conversation: conversation({ archivedAt: now, stateVersion: 2n }), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: now }, isBlocked: false, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } });

    await expect(service().setArchived(customer.id, conversationId, true, now)).resolves.toMatchObject({
      archived: true,
      conversation: { archivedAt: now.toISOString(), stateVersion: "2" }
    });

    expect(store.setParticipantArchived).toHaveBeenCalledWith(customer.id, conversationId, true, now);
    expect(store.findConversationAccess).toHaveBeenCalledTimes(2);
  });

  it("keeps recipient archive restoration in the incoming-message transaction contract", async () => {
    const source = readFileSync(new URL("../../models/messaging.model.ts", import.meta.url), "utf8");

    expect(source).toContain("userId: { not: input.senderUserId }");
    expect(source).toContain("data: { archivedAt: null }");
  });

  it("unblocks the caller's counterpart without changing conversation status", async () => {
    await expect(service().unblockConversation(customer.id, conversationId, now)).resolves.toMatchObject({ id: conversationId, status: "PENDING" });

    expect(store.deleteBlock).toHaveBeenCalledWith(conversationId, customer.id, tech.id, now);
    expect(store.transitionRequestStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["no blocks", false],
    ["actor-only block", true],
    ["counterpart-only block", true],
    ["both-direction blocks", true]
  ])("returns the same privacy-neutral management capability for %s", async (_label, isBlocked) => {
    store.findConversationAccess
      .mockResolvedValueOnce({ conversation: conversation({ isBlocked }), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: null }, isBlocked, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } })
      .mockResolvedValueOnce({ conversation: conversation({ isBlocked: true, stateVersion: 2n }), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: null }, isBlocked: true, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } });

    await expect(service().blockConversation(customer.id, conversationId, now)).resolves.toMatchObject({
      isBlocked: true,
      canManageBlock: true,
      stateVersion: "2"
    });
    expect(store.insertBlock).toHaveBeenCalledWith(conversationId, customer.id, tech.id, now);
  });

  it.each([
    ["no blocks", false, false],
    ["actor-only block", true, false],
    ["counterpart-only block", true, true],
    ["both-direction blocks", true, true]
  ])("allows idempotent actor-block removal for %s", async (_label, beforeBlocked, afterBlocked) => {
    store.findConversationAccess
      .mockResolvedValueOnce({ conversation: conversation({ isBlocked: beforeBlocked }), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: null }, isBlocked: beforeBlocked, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } })
      .mockResolvedValueOnce({ conversation: conversation({ isBlocked: afterBlocked, stateVersion: 2n }), participant: { userId: customer.id, role: "CUSTOMER", lastReadSequence: 0n, archivedAt: null }, isBlocked: afterBlocked, canonicalPair: { customerUserId: customer.id, techUserId: tech.id } });

    await expect(service().unblockConversation(customer.id, conversationId, now)).resolves.toMatchObject({ isBlocked: afterBlocked, canManageBlock: true, stateVersion: "2" });
    expect(store.deleteBlock).toHaveBeenCalledWith(conversationId, customer.id, tech.id, now);
  });
});
