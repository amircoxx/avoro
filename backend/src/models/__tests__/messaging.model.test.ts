import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../database.model", () => ({ prisma: {} }));

import { createMessagingModel, toConversationDto, toMessageDto } from "../messaging.model";

function durableMessage(sequence: bigint) {
  return {
    id: `message-${sequence}`,
    sequence,
    conversationId: "conversation-1",
    senderUserId: "other-user",
    kind: "TEXT" as const,
    body: `Message ${sequence}`,
    createdAt: new Date(Date.UTC(2026, 7, 14, 12, 0, Number(sequence)))
  };
}

function pagingModel(sequences: bigint[]) {
  const records = sequences.map(durableMessage);
  const findMany = vi.fn(async (query: { where: { sequence?: { lt?: bigint; gt?: bigint } }; orderBy: { sequence: "asc" | "desc" }; take: number }) => {
    const filtered = records.filter((record) =>
      (!query.where.sequence?.lt || record.sequence < query.where.sequence.lt) &&
      (!query.where.sequence?.gt || record.sequence > query.where.sequence.gt)
    );
    return filtered.sort((left, right) => query.orderBy.sequence === "asc"
      ? Number(left.sequence - right.sequence)
      : Number(right.sequence - left.sequence)).slice(0, query.take);
  });
  return { model: createMessagingModel({ message: { findMany } } as never), findMany };
}

describe("messaging model", () => {
  it.each([
    ["no blocks", false],
    ["actor block", true],
    ["counterpart block", true],
    ["both blocks", true]
  ])("serializes a privacy-neutral block capability for %s", (_label, isBlocked) => {
    const dto = toConversationDto({
      id: "conversation-1", customerId: "customer-1", techProfileId: "profile-1", status: "ACCEPTED",
      requestedAt: new Date("2026-08-10T12:00:00.000Z"), acceptedAt: new Date("2026-08-11T12:00:00.000Z"), declinedAt: null,
      lastMessageAt: new Date("2026-08-15T12:00:00.000Z"), counterpart: { userId: "tech-1", displayName: "Maya", avatarUrl: null },
      lastMessage: null, unreadCount: 0, archivedAt: null, isBlocked, stateVersion: 42n
    });

    expect(dto).toMatchObject({ isBlocked, canManageBlock: true, stateVersion: "42" });
    expect(dto).not.toHaveProperty("canBlock");
    expect(dto).not.toHaveProperty("canUnblock");
  });

  it.each([
    ["no blocks", [], false],
    ["actor-only", [{ blockerUserId: "customer-1", blockedUserId: "tech-1" }], true],
    ["counterpart-only", [{ blockerUserId: "tech-1", blockedUserId: "customer-1" }], true],
    ["both directions", [{ blockerUserId: "customer-1", blockedUserId: "tech-1" }, { blockerUserId: "tech-1", blockedUserId: "customer-1" }], true]
  ])("projects the exact same public management capability for %s", async (_label, blocks, isBlocked) => {
    const row = {
      id: "conversation-1", customerId: "customer-1", techProfileId: "profile-1", status: "ACCEPTED" as const,
      requestedAt: new Date("2026-08-10T12:00:00.000Z"), acceptedAt: new Date("2026-08-11T12:00:00.000Z"), declinedAt: null,
      lastMessageAt: new Date("2026-08-15T12:00:00.000Z"), stateVersion: 42n,
      customer: { id: "customer-1", fullName: "Avery", avatarUrl: null },
      techProfile: { id: "profile-1", userId: "tech-1", businessName: "Maya Hair", displayName: "Maya", user: { id: "tech-1", fullName: "Maya", avatarUrl: null } },
      participants: [{ userId: "customer-1", role: "CUSTOMER" as const, lastReadSequence: 0n, archivedAt: null }], messages: []
    };
    const transaction = {
      conversation: { findMany: vi.fn().mockResolvedValue([row]) },
      message: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
      messagingBlock: { findMany: vi.fn().mockResolvedValue(blocks) }
    };
    const model = createMessagingModel({ $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as never);
    const page = await model.listConversations("customer-1", { limit: 30 });

    expect(toConversationDto(page.conversations[0]!)).toEqual({
      id: "conversation-1", status: "ACCEPTED", counterpart: { userId: "tech-1", displayName: "Maya", avatarUrl: null },
      requestedAt: "2026-08-10T12:00:00.000Z", acceptedAt: "2026-08-11T12:00:00.000Z", declinedAt: null,
      lastMessageAt: "2026-08-15T12:00:00.000Z", lastMessage: null, unreadCount: 0, archivedAt: null,
      isBlocked, canManageBlock: true, stateVersion: "42"
    });
  });

  it("increments conversation state for participant read/archive and directional block mutations", async () => {
    const mutationNow = new Date("2026-08-15T12:00:00.000Z");
    const update = vi.fn().mockResolvedValue({ stateVersion: 42n });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      conversation: { update },
      conversationParticipant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      messagingBlock: { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      messagingDeliveryOutbox: { createMany }
    };
    const model = createMessagingModel({ $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as never);

    await model.withSerializableTransaction(async (store) => {
      await store.setParticipantArchived("customer-1", "conversation-1", true, mutationNow);
      await store.advanceReadCursor("customer-1", "conversation-1", 10n, mutationNow);
      await store.insertBlock("conversation-1", "customer-1", "tech-1", mutationNow);
      await store.deleteBlock("conversation-1", "customer-1", "tech-1", mutationNow);
    });

    expect(update).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenCalledWith({ where: { id: "conversation-1" }, data: { stateVersion: { increment: 1n } } });
    const deliveries = createMany.mock.calls.flatMap(([input]) => input.data);
    expect(deliveries.filter((delivery) => delivery.recipientUserId === "customer-1")).toHaveLength(4);
    expect(deliveries.filter((delivery) => delivery.recipientUserId === "tech-1")).toHaveLength(2);
    expect(deliveries.every((delivery) => delivery.deliveryKind === "REALTIME_CONVERSATION")).toBe(true);
    expect(JSON.stringify(deliveries)).not.toContain("body");
  });

  it("increments state in the lifecycle compare-and-set before re-reading canonical data", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const row = {
      id: "conversation-1", customerId: "customer-1", techProfileId: "profile-1", status: "ACCEPTED" as const,
      requestedAt: new Date("2026-08-10T12:00:00.000Z"), acceptedAt: new Date("2026-08-15T12:00:00.000Z"), declinedAt: null,
      lastMessageAt: new Date("2026-08-15T12:00:00.000Z"), stateVersion: 2n,
      customer: { id: "customer-1", fullName: "Avery", avatarUrl: null },
      techProfile: { id: "profile-1", userId: "tech-1", businessName: "Maya Hair", displayName: "Maya", user: { id: "tech-1", fullName: "Maya", avatarUrl: null } },
      participants: [{ userId: "tech-1", role: "TECH" as const, lastReadSequence: 0n, archivedAt: null }], messages: []
    };
    const transaction = {
      conversation: { updateMany, findFirst: vi.fn().mockResolvedValue(row) },
      message: { count: vi.fn().mockResolvedValue(0) }, messagingBlock: { findMany: vi.fn().mockResolvedValue([]) },
      messagingDeliveryOutbox: { createMany: vi.fn().mockResolvedValue({ count: 3 }) }
    };
    const model = createMessagingModel({ $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as never);

    await model.withSerializableTransaction((store) => store.transitionRequestStatus({ actorUserId: "tech-1", conversationId: "conversation-1", status: "ACCEPTED", now: new Date("2026-08-15T12:00:00.000Z") }));

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stateVersion: { increment: 1n } }) }));
    const deliveries = transaction.messagingDeliveryOutbox.createMany.mock.calls[0]![0].data;
    expect(deliveries.filter((delivery: { deliveryKind: string }) => delivery.deliveryKind === "REALTIME_CONVERSATION").map((delivery: { recipientUserId: string }) => delivery.recipientUserId).sort()).toEqual(["customer-1", "tech-1"]);
  });
  it("serializes durable message sequences and timestamps at the service boundary", () => {
    expect(toMessageDto({
      id: "message-1",
      sequence: 42n,
      conversationId: "conversation-1",
      senderUserId: "user-1",
      kind: "TEXT",
      body: "Hello",
      createdAt: new Date("2026-08-14T12:00:00.000Z")
    })).toEqual({
      id: "message-1",
      sequence: "42",
      conversationId: "conversation-1",
      senderUserId: "user-1",
      kind: "TEXT",
      body: "Hello",
      createdAt: "2026-08-14T12:00:00.000Z"
    });
  });

  it("keeps inbox reads participant-scoped, publicly projected, and newest-message ordered", () => {
    const source = readFileSync(new URL("../messaging.model.ts", import.meta.url), "utf8");
    const projection = source.slice(source.indexOf("function conversationInboxInclude"), source.indexOf("export function toMessageDto"));

    expect(source).toContain("participants: { some: { userId: actorUserId } }");
    expect(projection).toContain("select: { id: true, fullName: true, avatarUrl: true }");
    expect(projection).toContain("messages: { orderBy: { sequence: \"desc\" }, take: 1 }");
    expect(projection).not.toContain("email");
  });

  it("takes the inbox page and recovery cursor from one repeatable-read snapshot", async () => {
    const transaction = {
      conversation: { findMany: vi.fn().mockResolvedValue([]) },
      message: { findFirst: vi.fn().mockResolvedValue({ sequence: 42n }) }
    };
    const database = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual({ isolationLevel: "RepeatableRead" });
        return work(transaction);
      })
    };
    const model = createMessagingModel(database as never);

    await expect(model.listConversations("user-1", { limit: 30 })).resolves.toMatchObject({
      conversations: [],
      syncSequence: 42n
    });
    expect(transaction.conversation.findMany).toHaveBeenCalledOnce();
    expect(transaction.message.findFirst).toHaveBeenCalledOnce();
  });

  it("continues bounded before and after pages without duplicates and with canonical ascending messages", async () => {
    const { model, findMany } = pagingModel([1n, 2n, 3n, 4n, 5n, 6n, 7n]);

    const newest = await model.listMessages("user-1", "conversation-1", { beforeSequence: "8", limit: 3 });
    const older = await model.listMessages("user-1", "conversation-1", { beforeSequence: newest.nextSequence!.toString(), limit: 3 });
    const oldest = await model.listMessages("user-1", "conversation-1", { beforeSequence: older.nextSequence!.toString(), limit: 3 });
    const forward = await model.listMessages("user-1", "conversation-1", { afterSequence: "0", limit: 3 });
    const forwardNext = await model.listMessages("user-1", "conversation-1", { afterSequence: forward.nextSequence!.toString(), limit: 3 });
    const forwardLast = await model.listMessages("user-1", "conversation-1", { afterSequence: forwardNext.nextSequence!.toString(), limit: 3 });
    const sync = await model.syncMessages("user-1", { afterSequence: "0", limit: 3 });
    const syncNext = await model.syncMessages("user-1", { afterSequence: sync.nextSequence!.toString(), limit: 3 });

    expect(newest).toMatchObject({ messages: [{ sequence: 5n }, { sequence: 6n }, { sequence: 7n }], nextSequence: 5n, hasMore: true });
    expect(older).toMatchObject({ messages: [{ sequence: 2n }, { sequence: 3n }, { sequence: 4n }], nextSequence: 2n, hasMore: true });
    expect(oldest).toMatchObject({ messages: [{ sequence: 1n }], nextSequence: null, hasMore: false });
    expect(forward).toMatchObject({ messages: [{ sequence: 1n }, { sequence: 2n }, { sequence: 3n }], nextSequence: 3n, hasMore: true });
    expect(forwardNext).toMatchObject({ messages: [{ sequence: 4n }, { sequence: 5n }, { sequence: 6n }], nextSequence: 6n, hasMore: true });
    expect(forwardLast).toMatchObject({ messages: [{ sequence: 7n }], nextSequence: null, hasMore: false });
    expect(sync).toMatchObject({ messages: [{ sequence: 1n }, { sequence: 2n }, { sequence: 3n }], nextSequence: 3n, hasMore: true });
    expect(syncNext).toMatchObject({ messages: [{ sequence: 4n }, { sequence: 5n }, { sequence: 6n }], nextSequence: 6n, hasMore: true });
    expect([...oldest.messages, ...older.messages, ...newest.messages].map(({ sequence }) => sequence)).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect([...forward.messages, ...forwardNext.messages, ...forwardLast.messages].map(({ sequence }) => sequence)).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect(findMany).toHaveBeenCalledTimes(8);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversation: { participants: { some: { userId: "user-1" } } } })
    }));
  });

  it("returns the last sequence on a non-empty final sync page", async () => {
    const { model } = pagingModel([42n]);

    await expect(model.syncMessages("user-1", { afterSequence: "41", limit: 100 })).resolves.toMatchObject({
      messages: [{ sequence: 42n }],
      nextSequence: 42n,
      hasMore: false
    });
  });

  it("counts unread messages in PostgreSQL without materializing lifetime sequences", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ unreadMessages: 3n }]);
    const count = vi.fn().mockResolvedValue(2);
    const model = createMessagingModel({
      $queryRaw: queryRaw,
      conversation: { count }
    } as never);

    await expect(model.getUnreadSummary("user-1")).resolves.toEqual({ unreadMessages: 3, pendingRequests: 2, total: 5 });
    const sql = queryRaw.mock.calls[0]![0].strings.join(" ");
    expect(sql).toContain('COUNT(message."id")');
    expect(sql).toContain('message."sequence" > participant."lastReadSequence"');
    expect(sql).toContain('message."senderUserId" <>');
  });

  it("clears only the recipient archive inside accepted-message persistence", async () => {
    const savedMessage = durableMessage(42n);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      message: { create: vi.fn().mockResolvedValue(savedMessage), count: vi.fn().mockResolvedValue(0) },
      conversation: {
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue({
          id: "conversation-1", customerId: "customer-1", techProfileId: "profile-1", status: "ACCEPTED",
          requestedAt: new Date("2026-08-10T12:00:00.000Z"), acceptedAt: new Date("2026-08-11T12:00:00.000Z"), declinedAt: null,
          lastMessageAt: new Date("2026-08-15T12:00:00.000Z"), stateVersion: 3n,
          customer: { id: "customer-1", fullName: "Avery", avatarUrl: null },
          techProfile: { id: "profile-1", userId: "tech-1", businessName: "Maya Hair", displayName: "Maya", user: { id: "tech-1", fullName: "Maya", avatarUrl: null } },
          participants: [{ userId: "customer-1", role: "CUSTOMER", lastReadSequence: 41n, archivedAt: null }],
          messages: [savedMessage]
        })
      },
      conversationParticipant: { updateMany },
      messagingBlock: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const model = createMessagingModel({ $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as never);

    await model.withSerializableTransaction((store) => store.createAcceptedMessage({
      conversationId: "conversation-1", senderUserId: "customer-1", body: "Hello", clientRequestId: "request-2",
      now: new Date("2026-08-15T12:00:00.000Z"), clearRecipientArchive: true, advanceSenderReadCursor: true
    }));

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: "conversation-1", userId: { not: "customer-1" } },
      data: { archivedAt: null }
    }));
    expect(transaction.conversation.update).toHaveBeenCalledWith({ where: { id: "conversation-1" }, data: { stateVersion: { increment: 3n } } });
  });

  it("persists an explicit delayed email delivery schedule", async () => {
    const create = vi.fn().mockResolvedValue({});
    const transaction = { messagingDeliveryOutbox: { create } };
    const model = createMessagingModel({ $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as never);
    const nextAttemptAt = new Date("2026-08-15T12:02:00.000Z");

    await model.withSerializableTransaction((store) => store.createRecipientDelivery({
      eventKey: "message-2:message:email:tech-1", deliveryKind: "EMAIL_MESSAGE", conversationId: "conversation-1",
      messageId: "message-2", recipientUserId: "tech-1", payload: { conversationId: "conversation-1", messageId: "message-2" },
      now: new Date("2026-08-15T12:00:00.000Z"), nextAttemptAt
    }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nextAttemptAt }) }));
  });

  it("claims realtime event keys and publishes only the event-bus identifier contract", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const database = {
      $transaction: vi.fn(async (work: (tx: { $queryRaw: typeof queryRaw; messagingDeliveryOutbox: { updateMany: typeof updateMany } }) => Promise<unknown>) =>
        work({ $queryRaw: queryRaw, messagingDeliveryOutbox: { updateMany } }))
    };
    const model = createMessagingModel(database as never);
    const now = new Date("2026-08-15T12:00:00.000Z");

    await model.claimDeliveryBatch(now, { includeEmail: false });
    const claimSql = queryRaw.mock.calls[0][0];
    expect(claimSql.strings.join(" ")).toContain('outbox."eventKey"');
    expect(claimSql.strings.join(" ")).toContain("REALTIME_MESSAGE");

    queryRaw.mockClear();
    await model.publishRealtimeDelivery({
      id: "delivery-1",
      eventKey: "message-2:message:realtime:tech-1",
      deliveryKind: "REALTIME_MESSAGE",
      conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
      messageId: "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee",
      recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
      payload: {},
      attempts: 1,
      leasedAt: now
    }, now);

    const notification = JSON.parse(queryRaw.mock.calls[0][0].values[0]);
    expect(notification).toEqual({
      eventKey: "message-2:message:realtime:tech-1",
      kind: "message",
      conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
      messageId: "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee",
      recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b"
    });
    expect(JSON.stringify(notification)).not.toContain("body");
    expect(JSON.stringify(notification)).not.toContain("payload");

    queryRaw.mockClear();
    await model.publishRealtimeDelivery({
      id: "delivery-2",
      eventKey: "conversation-1:accepted:realtime:customer-1",
      deliveryKind: "REALTIME_CONVERSATION",
      conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
      messageId: null,
      recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
      payload: {},
      attempts: 1,
      leasedAt: now
    }, now);

    expect(JSON.parse(queryRaw.mock.calls[0][0].values[0])).toEqual({
      eventKey: "conversation-1:accepted:realtime:customer-1",
      kind: "conversation",
      conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
      recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b"
    });
  });
});
