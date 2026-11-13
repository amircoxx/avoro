import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const databaseSuite = runDatabaseTests ? describe : describe.skip;

type MessagingModel = ReturnType<typeof import("../models/messaging.model").createMessagingModel>;
type MessagingService = ReturnType<typeof import("../services/messaging.service").createMessagingService>;
type Pair = {
  customer: { id: string; role: "CUSTOMER" };
  tech: { id: string; role: "TECH" };
  techProfileId: string;
};

databaseSuite("messaging concurrency against TEST_DATABASE_URL (skipped unless RUN_DB_TESTS=1)", () => {
  let testPrisma: PrismaClient;
  let model: MessagingModel;
  let service: MessagingService;
  const userIds: string[] = [];
  const techProfileIds: string[] = [];

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("RUN_DB_TESTS=1 requires a dedicated TEST_DATABASE_URL");
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL must not match the normal DATABASE_URL");
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    testPrisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    const [{ createMessagingModel }, { createMessagingService }] = await Promise.all([
      import("../models/messaging.model"),
      import("../services/messaging.service")
    ]);
    model = createMessagingModel(testPrisma);
    service = createMessagingService(model);
  });

  afterAll(async () => {
    if (!testPrisma) return;
    await testPrisma.conversation.deleteMany({ where: { customerId: { in: userIds } } });
    await testPrisma.messagingBlock.deleteMany({
      where: { OR: [{ blockerUserId: { in: userIds } }, { blockedUserId: { in: userIds } }] }
    });
    await testPrisma.techProfile.deleteMany({ where: { id: { in: techProfileIds } } });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
    await testPrisma.$disconnect();
  });

  it("creates exactly one request under concurrent identical retries", async () => {
    const pair = await createPair("same-request");
    const input = requestInput(pair.techProfileId, "same request body");

    const results = await Promise.all([
      service.createRequest(pair.customer.id, input),
      service.createRequest(pair.customer.id, input)
    ]);

    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    await expect(testPrisma.message.count({
      where: { senderUserId: pair.customer.id, clientRequestId: input.clientRequestId }
    })).resolves.toBe(1);
    const deliveries = await testPrisma.messagingDeliveryOutbox.findMany({
      where: { conversationId: results[0].conversation.id },
      select: { payload: true }
    });
    expect(deliveries).toHaveLength(3);
    expect(JSON.stringify(deliveries)).not.toContain(input.body);
  });

  it("creates one customer and tech conversation under concurrent different request IDs", async () => {
    const pair = await createPair("different-requests");
    const writes = await Promise.allSettled([
      service.createRequest(pair.customer.id, requestInput(pair.techProfileId, "first request")),
      service.createRequest(pair.customer.id, requestInput(pair.techProfileId, "second request"))
    ]);

    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(writes.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "request_pending" }
    });
    await expect(testPrisma.conversation.count({
      where: { customerId: pair.customer.id, techProfileId: pair.techProfileId }
    })).resolves.toBe(1);
    await expect(testPrisma.message.count({ where: { senderUserId: pair.customer.id } })).resolves.toBe(1);
  });

  it("allows exactly one winner when accept and decline race", async () => {
    const { pair, conversationId } = await createPendingPair("request-decision");
    const operations = [
      { status: "ACCEPTED" as const, run: () => service.acceptRequest(pair.tech, conversationId) },
      { status: "DECLINED" as const, run: () => service.declineRequest(pair.tech, conversationId) }
    ];
    const decisions = await Promise.allSettled(operations.map((operation) => operation.run()));

    expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(decisions.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "request_not_pending" }
    });
    const winnerIndex = decisions.findIndex((result) => result.status === "fulfilled");
    const winner = decisions[winnerIndex];
    if (winner?.status !== "fulfilled") throw new Error("A request decision winner was not returned");
    const winningStatus = operations[winnerIndex].status;
    expect(winner.value.status).toBe(winningStatus);
    const persisted = await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(persisted.status).toBe(winningStatus);
    expect({
      acceptedAt: persisted.acceptedAt !== null,
      declinedAt: persisted.declinedAt !== null
    }).toEqual(winningStatus === "ACCEPTED"
      ? { acceptedAt: true, declinedAt: false }
      : { acceptedAt: false, declinedAt: true });
  });

  it("serializes accept versus send so a message is never committed before acceptance", async () => {
    const { pair, conversationId } = await createPendingPair("accept-send");
    const input = messageInput(conversationId, "accept send race");

    const [accepted, sent] = await Promise.allSettled([
      service.acceptRequest(pair.tech, conversationId),
      service.sendMessage(pair.customer, input)
    ]);

    expect(accepted.status).toBe("fulfilled");
    if (sent.status === "rejected") {
      expect(sent.reason).toMatchObject({ code: "request_not_accepted" });
      await expect(service.sendMessage(pair.customer, input)).resolves.toMatchObject({ message: { body: input.body } });
    }
    await expect(testPrisma.message.count({
      where: { senderUserId: pair.customer.id, clientRequestId: input.clientRequestId }
    })).resolves.toBe(1);
    await expect(testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId } }))
      .resolves.toMatchObject({ status: "ACCEPTED" });
  });

  it("blocks the exact decline boundary and admits only one concurrent retry after it", async () => {
    const { pair, conversationId } = await createPendingPair("decline-retry-boundary");
    const declinedAt = new Date("2026-01-01T00:00:00.000Z");
    await service.declineRequest(pair.tech, conversationId, declinedAt);
    const boundary = new Date("2026-01-31T00:00:00.000Z");

    await expect(service.createRequest(
      pair.customer.id,
      requestInput(pair.techProfileId, "boundary retry"),
      boundary
    )).rejects.toMatchObject({ code: "request_cooldown" });

    const afterBoundary = new Date(boundary.getTime() + 1);
    const retries = await Promise.allSettled([
      service.createRequest(pair.customer.id, requestInput(pair.techProfileId, "first retry"), afterBoundary),
      service.createRequest(pair.customer.id, requestInput(pair.techProfileId, "second retry"), afterBoundary)
    ]);
    expect(retries.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(retries.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(retries.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "request_pending" }
    });
  });

  it("serializes block versus send and rejects every later send", async () => {
    const { pair, conversationId } = await createAcceptedPair("block-send");
    const racedInput = messageInput(conversationId, "raced message");

    const [blocked, sent] = await Promise.allSettled([
      service.blockConversation(pair.tech.id, conversationId),
      service.sendMessage(pair.customer, racedInput)
    ]);

    expect(blocked.status).toBe("fulfilled");
    if (sent.status === "rejected") expect(sent.reason).toMatchObject({ code: "messaging_blocked" });
    await expect(testPrisma.message.count({
      where: { senderUserId: pair.customer.id, clientRequestId: racedInput.clientRequestId }
    })).resolves.toBe(sent.status === "fulfilled" ? 1 : 0);
    await expect(service.sendMessage(pair.customer, messageInput(conversationId, "blocked later message")))
      .rejects.toMatchObject({ code: "messaging_blocked" });
  });

  it("replays an accepted message retry without duplicating the message or delivery rows", async () => {
    const { pair, conversationId } = await createAcceptedPair("message-retry");
    const input = messageInput(conversationId, "one accepted message");

    const results = await Promise.all([
      service.sendMessage(pair.customer, input),
      service.sendMessage(pair.customer, input)
    ]);

    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    await expect(testPrisma.message.count({
      where: { senderUserId: pair.customer.id, clientRequestId: input.clientRequestId }
    })).resolves.toBe(1);
    await expect(testPrisma.messagingDeliveryOutbox.count({
      where: { messageId: results[0].message.id }
    })).resolves.toBe(3);
  });

  it("returns every message once in strictly increasing sequence pagination", async () => {
    const { pair, conversationId, requestSequence } = await createAcceptedPair("sequence-pages");
    const expectedMessages = [];
    for (let index = 0; index < 5; index += 1) {
      expectedMessages.push((await service.sendMessage(
        pair.customer,
        messageInput(conversationId, `page message ${index + 1}`)
      )).message);
    }

    const pages = [];
    const requestedAfterSequences: string[] = [];
    let afterSequence = requestSequence;
    let hasMore = true;
    while (hasMore) {
      requestedAfterSequences.push(afterSequence);
      const page = await service.listMessages(pair.customer, conversationId, { afterSequence, limit: 2 });
      pages.push(page);
      hasMore = page.hasMore;
      if (page.nextSequence) afterSequence = page.nextSequence;
      else if (hasMore) throw new Error("A non-final message page did not advance its sequence");
    }

    expect(pages.map((page) => page.messages.length)).toEqual([2, 2, 1]);
    expect(pages.every((page) => page.messages.length <= 2)).toBe(true);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    const seenMessages = pages.flatMap((page) => page.messages);
    expect(seenMessages.map(({ id, sequence }) => ({ id, sequence }))).toEqual(
      expectedMessages.map(({ id, sequence }) => ({ id, sequence }))
    );
    expect(new Set(seenMessages.map((message) => message.id)).size).toBe(5);
    expect(new Set(seenMessages.map((message) => message.sequence)).size).toBe(5);
    expect(seenMessages.every((message, index) =>
      index === 0 || BigInt(message.sequence) > BigInt(seenMessages[index - 1].sequence)
    )).toBe(true);
    for (let index = 0; index < pages.length - 1; index += 1) {
      const page = pages[index];
      const lastSequence = page.messages.at(-1)?.sequence;
      expect(page.nextSequence).toBe(lastSequence);
      expect(requestedAfterSequences[index + 1]).toBe(lastSequence);
      expect(BigInt(requestedAfterSequences[index + 1])).toBeGreaterThan(BigInt(requestedAfterSequences[index]));
    }
    expect(pages.at(-1)?.nextSequence).toBeNull();
  });

  it("does not regress a read cursor when a lower update follows a higher update", async () => {
    const { pair, conversationId } = await createAcceptedPair("read-cursor");
    const messages = [];
    for (let index = 0; index < 3; index += 1) {
      messages.push(await service.sendMessage(pair.customer, messageInput(conversationId, `read message ${index + 1}`)));
    }
    const lower = messages[0].message.sequence;
    const higher = messages[2].message.sequence;

    await service.markRead(pair.tech, conversationId, higher);
    await service.markRead(pair.tech, conversationId, lower);

    await expect(testPrisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: pair.tech.id } },
      select: { lastReadSequence: true }
    })).resolves.toEqual({ lastReadSequence: BigInt(higher) });
  });

  it("claims unlocked rows in a second session while the first session holds earlier row locks", async () => {
    const { pair, conversationId } = await createPendingPair("multiple-dispatchers");
    await testPrisma.messagingDeliveryOutbox.updateMany({
      where: { recipientUserId: { in: userIds }, processedAt: null },
      data: { processedAt: new Date() }
    });
    const dueAt = new Date(Date.now() + 5_000);
    const lockedCreatedAt = new Date(dueAt.getTime() - 2_000);
    const unlockedCreatedAt = new Date(dueAt.getTime() - 1_000);
    const lockedRows = await Promise.all(Array.from({ length: 2 }, (_, index) =>
      createDispatcherFixture(`${randomUUID()}:locked:${index}`, lockedCreatedAt)
    ));
    const unlockedRows = await Promise.all(Array.from({ length: 3 }, (_, index) =>
      createDispatcherFixture(`${randomUUID()}:unlocked:${index}`, unlockedCreatedAt)
    ));
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("The database suite lost TEST_DATABASE_URL");
    const lockerPrisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    const claimerPrisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    const claimerModel = (await import("../models/messaging.model")).createMessagingModel(claimerPrisma);
    const locksAcquired = deferred<void>();
    const releaseLocks = deferred<void>();
    let locksReleased = false;
    let claimPromise: ReturnType<typeof claimerModel.claimDeliveryBatch> | undefined;
    const lockTransaction = lockerPrisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "MessagingDeliveryOutbox"
        WHERE "id" IN (${Prisma.join(lockedRows.map((row) => row.id))})
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE
      `);
      locksAcquired.resolve();
      await releaseLocks.promise;
    });

    try {
      await beforeDeadline(Promise.race([
        locksAcquired.promise,
        lockTransaction.then(() => { throw new Error("The lock transaction ended before acquiring row locks"); })
      ]), 2_000, "The first dispatcher session did not acquire row locks");
      claimPromise = claimerModel.claimDeliveryBatch(dueAt, { includeEmail: true });
      const claimed = await beforeDeadline(
        claimPromise,
        2_000,
        "The second dispatcher session waited on locked rows instead of skipping them"
      );
      const fixtureIds = new Set([...lockedRows, ...unlockedRows].map((row) => row.id));
      const claimedFixtureIds = claimed.filter((row) => fixtureIds.has(row.id)).map((row) => row.id);

      expect(locksReleased).toBe(false);
      expect(new Set(claimedFixtureIds)).toEqual(new Set(unlockedRows.map((row) => row.id)));
      expect(claimedFixtureIds).toHaveLength(3);
      expect(claimedFixtureIds.every((id) => !lockedRows.some((row) => row.id === id))).toBe(true);
    } finally {
      locksReleased = true;
      releaseLocks.resolve();
      const settledClaim = claimPromise?.catch(() => undefined);
      try {
        await lockTransaction;
        await settledClaim;
      } finally {
        await Promise.all([lockerPrisma.$disconnect(), claimerPrisma.$disconnect()]);
      }
    }

    function createDispatcherFixture(eventKey: string, createdAt: Date) {
      return testPrisma.messagingDeliveryOutbox.create({
        data: {
          eventKey,
          deliveryKind: "REALTIME_CONVERSATION",
          conversationId,
          recipientUserId: pair.tech.id,
          payload: { conversationId },
          nextAttemptAt: createdAt,
          createdAt
        }
      });
    }
  });

  it("recovers a delivery only after its lease expires", async () => {
    const { pair, conversationId } = await createPendingPair("lease-recovery");
    await testPrisma.messagingDeliveryOutbox.updateMany({
      where: { recipientUserId: { in: userIds }, processedAt: null },
      data: { processedAt: new Date() }
    });
    const leasedAt = new Date(Date.now() + 1_000);
    const eventKey = `${randomUUID()}:lease-recovery`;
    const delivery = await testPrisma.messagingDeliveryOutbox.create({
      data: {
        eventKey,
        deliveryKind: "REALTIME_CONVERSATION",
        conversationId,
        recipientUserId: pair.tech.id,
        payload: { conversationId },
        nextAttemptAt: leasedAt,
        createdAt: leasedAt
      }
    });

    // Exercise a non-UTC session even when the test database defaults to UTC.
    const timezoneModel = (await import("../models/messaging.model")).createMessagingModel({
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        testPrisma.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL TIME ZONE 'America/New_York'`;
          return work(tx);
        })
    } as never);
    const firstClaim = await timezoneModel.claimDeliveryBatch(leasedAt, { includeEmail: true });
    const beforeExpiry = await timezoneModel.claimDeliveryBatch(new Date(leasedAt.getTime() + 59_999), { includeEmail: true });
    const afterExpiry = await timezoneModel.claimDeliveryBatch(new Date(leasedAt.getTime() + 60_000), { includeEmail: true });

    expect(firstClaim.map((row) => row.id)).toContain(delivery.id);
    expect(firstClaim.find((row) => row.id === delivery.id)?.leasedAt).toEqual(leasedAt);
    expect(beforeExpiry.map((row) => row.id)).not.toContain(delivery.id);
    expect(afterExpiry).toContainEqual(expect.objectContaining({ id: delivery.id, attempts: 2 }));
  });

  it("publishes identifiers only on commit and rolls notification publication back with delivery state", async () => {
    const { pair, conversationId } = await createPendingPair("notification-transaction");
    await testPrisma.messagingDeliveryOutbox.updateMany({
      where: { conversationId, processedAt: null },
      data: { processedAt: new Date() }
    });
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("The database suite lost TEST_DATABASE_URL");
    const listener = new Client({ connectionString: testDatabaseUrl });
    const notifications: string[] = [];
    await listener.connect();
    listener.on("notification", (message) => {
      if (message.channel === "messaging_events" && message.payload) notifications.push(message.payload);
    });
    await listener.query("LISTEN messaging_events");

    try {
      const published = await createClaimedRealtimeDelivery("committed-publication");
      await model.publishRealtimeDelivery(published, new Date(published.leasedAt.getTime() + 1));
      await beforeDeadline(waitFor(() => notifications.length === 1), 2_000, "Committed notification was not published");
      expect(JSON.parse(notifications[0])).toEqual({
        eventKey: published.eventKey,
        kind: "conversation",
        conversationId,
        recipientUserId: pair.tech.id
      });
      expect(notifications[0]).not.toContain("notification-transaction request");

      const rolledBack = await createClaimedRealtimeDelivery("rolled-back-publication");
      const rollbackPayload = JSON.stringify({
        eventKey: rolledBack.eventKey,
        kind: "conversation",
        conversationId,
        recipientUserId: pair.tech.id
      });
      await expect(testPrisma.$transaction(async (tx) => {
        await tx.messagingDeliveryOutbox.updateMany({
          where: { id: rolledBack.id, leasedAt: rolledBack.leasedAt, processedAt: null },
          data: { processedAt: new Date(), leasedAt: null, nextAttemptAt: null }
        });
        await tx.$queryRaw(Prisma.sql`SELECT pg_notify('messaging_events', ${rollbackPayload})::text`);
        throw new Error("force publication rollback");
      })).rejects.toThrow("force publication rollback");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(notifications).toHaveLength(1);
      await expect(testPrisma.messagingDeliveryOutbox.findUniqueOrThrow({ where: { id: rolledBack.id } }))
        .resolves.toMatchObject({ processedAt: null, leasedAt: rolledBack.leasedAt });
    } finally {
      await listener.end();
    }

    async function createClaimedRealtimeDelivery(label: string) {
      const leasedAt = new Date();
      const row = await testPrisma.messagingDeliveryOutbox.create({
        data: {
          eventKey: `${randomUUID()}:${label}`,
          deliveryKind: "REALTIME_CONVERSATION",
          conversationId,
          recipientUserId: pair.tech.id,
          payload: { conversationId },
          attempts: 1,
          leasedAt,
          nextAttemptAt: leasedAt
        }
      });
      return { ...row, leasedAt };
    }
  });

  it("coalesces concurrent email rows across independent dispatcher models", async () => {
    const { pair, conversationId } = await createAcceptedPair("email-coalescing");
    await testPrisma.messagingDeliveryOutbox.updateMany({
      where: { conversationId, processedAt: null },
      data: { processedAt: new Date() }
    });
    await Promise.all([
      service.sendMessage(pair.customer, messageInput(conversationId, "first coalesced message")),
      service.sendMessage(pair.customer, messageInput(conversationId, "second coalesced message"))
    ]);
    const rows = await testPrisma.messagingDeliveryOutbox.findMany({
      where: { conversationId, recipientUserId: pair.tech.id, deliveryKind: "EMAIL_MESSAGE" },
      orderBy: { createdAt: "asc" }
    });
    expect(rows).toHaveLength(2);
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("The database suite lost TEST_DATABASE_URL");
    const clients = [
      new PrismaClient({ datasourceUrl: testDatabaseUrl }),
      new PrismaClient({ datasourceUrl: testDatabaseUrl })
    ];
    const [{ createMessagingModel }, { dispatchMessagingDeliveryBatch }] = await Promise.all([
      import("../models/messaging.model"),
      import("../services/messaging/messaging-delivery-dispatcher")
    ]);
    const independentModels = clients.map(createMessagingModel);
    const send = vi.fn().mockResolvedValue(undefined);
    const leasedRows = await Promise.all(rows.map((row, index) => {
      const leasedAt = new Date(Date.now() + index);
      return testPrisma.messagingDeliveryOutbox.update({
        where: { id: row.id },
        data: { attempts: 1, leasedAt, nextAttemptAt: leasedAt }
      });
    }));

    try {
      await Promise.all(leasedRows.map((row, index) => dispatchMessagingDeliveryBatch({
        enabled: true,
        apiKey: "test-key",
        sender: { email: "sender@example.test", name: "Find My Tech" },
        appPublicUrl: "https://example.test",
        client: { send },
        now: () => new Date(Date.now() + 10),
        model: {
          ...independentModels[index],
          claimDeliveryBatch: vi.fn().mockResolvedValue([{ ...row, leasedAt: row.leasedAt! }])
        }
      })));
      expect(send).toHaveBeenCalledTimes(1);
      await expect(testPrisma.messagingDeliveryOutbox.count({
        where: { id: { in: leasedRows.map((row) => row.id) }, processedAt: { not: null } }
      })).resolves.toBe(2);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  });

  async function createPair(label: string): Promise<Pair> {
    const customerId = randomUUID();
    const techUserId = randomUUID();
    const techProfileId = randomUUID();
    userIds.push(customerId, techUserId);
    techProfileIds.push(techProfileId);
    await testPrisma.user.createMany({
      data: [
        { id: customerId, email: `${customerId}@example.test`, fullName: `${label} customer`, role: "CUSTOMER" },
        { id: techUserId, email: `${techUserId}@example.test`, fullName: `${label} tech`, role: "TECH" }
      ]
    });
    await testPrisma.techProfile.create({
      data: {
        id: techProfileId,
        userId: techUserId,
        businessName: `${label} studio`,
        displayName: `${label} tech`,
        referralCode: `MSG-${randomUUID()}`,
        isPublished: true
      }
    });
    return {
      customer: { id: customerId, role: "CUSTOMER" },
      tech: { id: techUserId, role: "TECH" },
      techProfileId
    };
  }

  async function createPendingPair(label: string) {
    const pair = await createPair(label);
    const created = await service.createRequest(pair.customer.id, requestInput(pair.techProfileId, `${label} request`));
    return { pair, conversationId: created.conversation.id, requestSequence: created.message.sequence };
  }

  async function createAcceptedPair(label: string) {
    const pending = await createPendingPair(label);
    await service.acceptRequest(pending.pair.tech, pending.conversationId);
    return pending;
  }
});

function requestInput(techProfileId: string, body: string) {
  return { techProfileId, body, clientRequestId: randomUUID() };
}

function messageInput(conversationId: string, body: string) {
  return { conversationId, body, clientRequestId: randomUUID() };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function beforeDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitFor(predicate: () => boolean) {
  while (!predicate()) await new Promise((resolve) => setTimeout(resolve, 5));
}
