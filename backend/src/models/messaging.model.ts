/** Owns Prisma messaging reads, serializable writes, and service-safe record mapping. */
import { Prisma, type ConversationStatus, type MessageKind, type MessagingDeliveryKind, type UserRole } from "@prisma/client";
import { prisma } from "./database.model";
import type { ConversationDto, MessageDto, UnreadSummaryDto } from "../services/messaging.types";
import { AppError } from "../utils/errors";

type TransactionClient = Prisma.TransactionClient;
type MessageRecord = {
  id: string;
  sequence: bigint;
  conversationId: string;
  senderUserId: string;
  kind: MessageKind;
  body: string;
  createdAt: Date;
};

type ConversationRecord = {
  id: string;
  customerId: string;
  techProfileId: string;
  status: ConversationStatus;
  requestedAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  lastMessageAt: Date;
  counterpart: { userId: string; displayName: string; avatarUrl: string | null };
  lastMessage: MessageRecord | null;
  unreadCount: number;
  archivedAt: Date | null;
  isBlocked: boolean;
  stateVersion: bigint;
};

type ConversationAccess = {
  conversation: ConversationRecord;
  participant: { userId: string; role: UserRole; lastReadSequence: bigint; archivedAt: Date | null };
  isBlocked: boolean;
  canonicalPair: { customerUserId: string; techUserId: string } | null;
};

export type MessagingTransactionStore = {
  findRequestContext(customerId: string, techProfileId: string): Promise<{
    customerId: string;
    techProfileId: string;
    techUserId: string;
    techPublished: boolean;
    conversation: ConversationRecord | null;
    isBlocked: boolean;
    pairIsCanonical: boolean;
  } | null>;
  findConversationAccess(actorUserId: string, conversationId: string): Promise<ConversationAccess | null>;
  findMessageByClientRequestId(senderUserId: string, clientRequestId: string): Promise<{
    conversation: ConversationRecord;
    message: MessageRecord;
  } | null>;
  createRequest(input: {
    customerId: string;
    techProfileId: string;
    body: string;
    clientRequestId: string;
    now: Date;
    senderReadThroughNewMessage: boolean;
  }): Promise<{ conversation: ConversationRecord; message: MessageRecord }>;
  transitionRequestStatus(input: {
    actorUserId: string;
    conversationId: string;
    status: "ACCEPTED" | "DECLINED";
    now: Date;
  }): Promise<ConversationRecord | null>;
  insertBlock(conversationId: string, blockerUserId: string, blockedUserId: string, now: Date): Promise<void>;
  deleteBlock(conversationId: string, blockerUserId: string, blockedUserId: string, now: Date): Promise<void>;
  setParticipantArchived(userId: string, conversationId: string, archived: boolean, now: Date): Promise<boolean>;
  advanceReadCursor(userId: string, conversationId: string, throughSequence: bigint, now: Date): Promise<boolean>;
  createAcceptedMessage(input: {
    conversationId: string;
    senderUserId: string;
    body: string;
    clientRequestId: string;
    now: Date;
    clearRecipientArchive: boolean;
    advanceSenderReadCursor: boolean;
  }): Promise<{ conversation: ConversationRecord; message: MessageRecord }>;
  createRecipientDelivery(input: {
    eventKey: string;
    deliveryKind: MessagingDeliveryKind;
    conversationId: string;
    messageId?: string;
    recipientUserId: string;
    payload: Prisma.InputJsonValue;
    now: Date;
    nextAttemptAt?: Date;
  }): Promise<void>;
};

export type MessagingModel = ReturnType<typeof createMessagingModel>;
export type ClaimedMessagingDelivery = {
  id: string;
  eventKey: string;
  deliveryKind: MessagingDeliveryKind;
  conversationId: string;
  messageId: string | null;
  recipientUserId: string;
  payload: Prisma.JsonValue;
  attempts: number;
  leasedAt: Date;
};

export type MessagingDeliveryEmailContext = {
  recipientEmail: string;
  recipientDisplayName: string | null;
  recipientRole: "CUSTOMER" | "TECH";
  senderDisplayName: string;
  messageSequence: bigint | null;
  lastReadSequence: bigint;
  lastEmailAlertAt: Date | null;
  decision: "ACCEPTED" | "DECLINED" | undefined;
};

export type MessagingDeliveryPreparation = {
  context: MessagingDeliveryEmailContext | null;
  leasedAt: Date;
  send: boolean;
};

export const MESSAGING_DELIVERY_LEASE_MS = 60_000;

type ConversationListInput = {
  status?: ConversationStatus;
  archived?: boolean;
  cursor?: string;
  limit: number;
};
type MessagePageInput = { beforeSequence?: string; afterSequence?: string; limit: number };
type SyncInput = { afterSequence: string; limit: number };

const participantMembership = (actorUserId: string) => ({ participants: { some: { userId: actorUserId } } });

function conversationInboxInclude(actorUserId: string) {
  return {
    customer: { select: { id: true, fullName: true, avatarUrl: true } },
    techProfile: {
      select: {
        id: true,
        userId: true,
        businessName: true,
        displayName: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } }
      }
    },
    participants: { where: { userId: actorUserId }, select: { userId: true, role: true, lastReadSequence: true, archivedAt: true } },
    messages: { orderBy: { sequence: "desc" }, take: 1 }
  } satisfies Prisma.ConversationInclude;
}

export function toMessageDto(message: MessageRecord): MessageDto {
  return {
    id: message.id,
    sequence: message.sequence.toString(),
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    kind: message.kind,
    body: message.body,
    createdAt: message.createdAt.toISOString()
  };
}

export function toConversationDto(conversation: ConversationRecord): ConversationDto {
  return {
    id: conversation.id,
    status: conversation.status,
    counterpart: conversation.counterpart,
    requestedAt: conversation.requestedAt.toISOString(),
    acceptedAt: conversation.acceptedAt?.toISOString() ?? null,
    declinedAt: conversation.declinedAt?.toISOString() ?? null,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    lastMessage: conversation.lastMessage ? toMessageDto(conversation.lastMessage) : null,
    unreadCount: conversation.unreadCount,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    isBlocked: conversation.isBlocked,
    canManageBlock: true,
    stateVersion: conversation.stateVersion.toString()
  };
}

export function createMessagingModel(database: typeof prisma) {
  return {
    withSerializableTransaction: <T>(work: (store: MessagingTransactionStore) => Promise<T>) =>
      database.$transaction((tx) => work(createMessagingTransactionStore(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }),
    listConversations: (actorUserId: string, input: ConversationListInput) => listConversations(database, actorUserId, input),
    listMessages: (actorUserId: string, conversationId: string, input: MessagePageInput) =>
      listMessages(database, actorUserId, conversationId, input),
    getRealtimeMessage: (actorUserId: string, conversationId: string, messageId: string) =>
      getRealtimeMessage(database, actorUserId, conversationId, messageId),
    getRealtimeConversation: (actorUserId: string, conversationId: string) =>
      findConversationRecord(database, actorUserId, { id: conversationId }),
    syncMessages: (actorUserId: string, input: SyncInput) => syncMessages(database, actorUserId, input),
    getUnreadSummary: (actorUserId: string) => getUnreadSummary(database, actorUserId),
    getDeliveryHealth: (now: Date) => getDeliveryHealth(database, now),
    claimDeliveryBatch: (now: Date, options: { includeEmail: boolean }) => claimDeliveryBatch(database, now, options),
    completeDelivery: (id: string, leasedAt: Date, now: Date) => completeDelivery(database, id, leasedAt, now),
    completeEmailDelivery: (id: string, leasedAt: Date, now: Date, updateLastEmailAlert: boolean) =>
      completeEmailDelivery(database, id, leasedAt, now, updateLastEmailAlert),
    retryDelivery: (id: string, leasedAt: Date, nextAttemptAt: Date | null, lastError: string) =>
      retryDelivery(database, id, leasedAt, nextAttemptAt, lastError),
    publishRealtimeDelivery: (delivery: ClaimedMessagingDelivery, now: Date) => publishRealtimeDelivery(database, delivery, now),
    prepareEmailDelivery: (id: string, leasedAt: Date, now: Date) => prepareEmailDelivery(database, id, leasedAt, now)
  };
}

export const messagingModel = createMessagingModel(prisma);

function createMessagingTransactionStore(tx: TransactionClient): MessagingTransactionStore {
  return {
    async findRequestContext(customerId, techProfileId) {
      const profile = await tx.techProfile.findUnique({
        where: { id: techProfileId },
        select: { id: true, userId: true, isPublished: true, user: { select: { role: true } } }
      });
      if (!profile) return null;
      const [customer, conversation, block, participants] = await Promise.all([
        tx.user.findUnique({ where: { id: customerId }, select: { role: true } }),
        findConversationRecord(tx, customerId, { customerId, techProfileId }),
        tx.messagingBlock.findFirst({
          where: {
            OR: [
              { blockerUserId: customerId, blockedUserId: profile.userId },
              { blockerUserId: profile.userId, blockedUserId: customerId }
            ]
          },
          select: { id: true }
        }),
        tx.conversationParticipant.findMany({
          where: { conversation: { customerId, techProfileId } },
          select: { userId: true, role: true }
        })
      ]);
      return {
        customerId,
        techProfileId,
        techUserId: profile.userId,
        techPublished: profile.isPublished,
        conversation,
        isBlocked: Boolean(block),
        pairIsCanonical: customer?.role === "CUSTOMER" && profile.user.role === "TECH" && (!conversation || isCanonicalParticipantPair(
          participants,
          customerId,
          profile.userId
        ))
      };
    },
    async findConversationAccess(actorUserId, conversationId) {
      const conversation = await findConversationRecord(tx, actorUserId, { id: conversationId });
      if (!conversation) return null;
      const participant = await tx.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId: actorUserId } },
        select: { userId: true, role: true, lastReadSequence: true, archivedAt: true }
      });
      if (!participant) return null;
      const pair = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: {
          customerId: true,
          customer: { select: { role: true } },
          techProfile: { select: { userId: true, user: { select: { role: true } } } },
          participants: { select: { userId: true, role: true } }
        }
      });
      const canonicalPair = pair && pair.customer.role === "CUSTOMER" && pair.techProfile.user.role === "TECH" &&
        isCanonicalParticipantPair(pair.participants, pair.customerId, pair.techProfile.userId)
        ? { customerUserId: pair.customerId, techUserId: pair.techProfile.userId }
        : null;
      return { conversation, participant, isBlocked: conversation.isBlocked, canonicalPair };
    },
    async findMessageByClientRequestId(senderUserId, clientRequestId) {
      const message = await tx.message.findUnique({
        where: { senderUserId_clientRequestId: { senderUserId, clientRequestId } }
      });
      if (!message) return null;
      const conversation = await findConversationRecord(tx, senderUserId, { id: message.conversationId });
      return conversation ? { conversation, message } : null;
    },
    async createRequest(input) {
      const conversation = await tx.conversation.upsert({
        where: { customerId_techProfileId: { customerId: input.customerId, techProfileId: input.techProfileId } },
        create: {
          customerId: input.customerId,
          techProfileId: input.techProfileId,
          requestedAt: input.now,
          lastMessageAt: input.now,
          stateVersion: 1n,
          participants: { create: [
            { userId: input.customerId, role: "CUSTOMER" },
            { userId: (await tx.techProfile.findUniqueOrThrow({ where: { id: input.techProfileId }, select: { userId: true } })).userId, role: "TECH" }
          ] }
        },
        update: { status: "PENDING", requestedAt: input.now, acceptedAt: null, declinedAt: null, lastMessageAt: input.now, stateVersion: { increment: 1n } }
      });
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderUserId: input.customerId,
          kind: "REQUEST",
          body: input.body,
          clientRequestId: input.clientRequestId
        }
      });
      if (input.senderReadThroughNewMessage) {
        const advanced = await tx.conversationParticipant.updateMany({
          where: { conversationId: conversation.id, userId: input.customerId, lastReadSequence: { lt: message.sequence } },
          data: { lastReadSequence: message.sequence }
        });
        if (advanced.count === 1) await incrementConversationState(tx, conversation.id);
      }
      const record = await findConversationRecord(tx, input.customerId, { id: conversation.id });
      if (!record) throw new Error("Created messaging conversation could not be loaded");
      await tx.messagingDeliveryOutbox.createMany({
        data: [
          {
            eventKey: `${message.id}:request:realtime:${input.customerId}`,
            deliveryKind: "REALTIME_CONVERSATION",
            conversationId: conversation.id,
            messageId: message.id,
            recipientUserId: input.customerId,
            payload: { conversationId: conversation.id, messageId: message.id, status: "PENDING" },
            createdAt: input.now
          },
          {
            eventKey: `${message.id}:request:realtime:${record.counterpart.userId}`,
            deliveryKind: "REALTIME_CONVERSATION",
            conversationId: conversation.id,
            messageId: message.id,
            recipientUserId: record.counterpart.userId,
            payload: { conversationId: conversation.id, messageId: message.id, status: "PENDING" },
            createdAt: input.now
          },
          {
            eventKey: `${message.id}:request:email:${record.counterpart.userId}`,
            deliveryKind: "EMAIL_REQUEST",
            conversationId: conversation.id,
            messageId: message.id,
            recipientUserId: record.counterpart.userId,
            payload: { conversationId: conversation.id, messageId: message.id, status: "PENDING" },
            createdAt: input.now
          }
        ]
      });
      return { conversation: record, message };
    },
    async transitionRequestStatus(input) {
      const updated = await tx.conversation.updateMany({
        where: { id: input.conversationId, status: "PENDING" },
        data: input.status === "ACCEPTED"
          ? { status: "ACCEPTED", acceptedAt: input.now, declinedAt: null, stateVersion: { increment: 1n } }
          : { status: "DECLINED", declinedAt: input.now, stateVersion: { increment: 1n } }
      });
      if (updated.count !== 1) throw new AppError("Message request is no longer pending", 409, "request_not_pending");
      const record = await findConversationRecord(tx, input.actorUserId, { id: input.conversationId });
      if (!record) throw new Error("Updated messaging conversation could not be loaded");
      const recipientUserId = record.counterpart.userId;
      const decision = input.status === "ACCEPTED" ? "accepted" : "declined";
      await tx.messagingDeliveryOutbox.createMany({
        data: [
          {
            eventKey: `${input.conversationId}:${input.now.getTime()}:${decision}:realtime:${input.actorUserId}`,
            deliveryKind: "REALTIME_CONVERSATION",
            conversationId: input.conversationId,
            recipientUserId: input.actorUserId,
            payload: { conversationId: input.conversationId, status: input.status },
            createdAt: input.now
          },
          {
            eventKey: `${input.conversationId}:${input.now.getTime()}:${decision}:realtime:${recipientUserId}`,
            deliveryKind: "REALTIME_CONVERSATION",
            conversationId: input.conversationId,
            recipientUserId,
            payload: { conversationId: input.conversationId, status: input.status },
            createdAt: input.now
          },
          {
            eventKey: `${input.conversationId}:${input.now.getTime()}:${decision}:email:${recipientUserId}`,
            deliveryKind: "EMAIL_DECISION",
            conversationId: input.conversationId,
            recipientUserId,
            payload: { conversationId: input.conversationId, status: input.status },
            createdAt: input.now
          }
        ]
      });
      return record;
    },
    async insertBlock(conversationId, blockerUserId, blockedUserId, now) {
      await tx.messagingBlock.upsert({
        where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
        create: { blockerUserId, blockedUserId, createdAt: now },
        update: {}
      });
      const state = await incrementConversationState(tx, conversationId);
      await createConversationRealtimeRows(tx, {
        conversationId,
        recipientUserIds: [blockerUserId, blockedUserId],
        eventKey: `${conversationId}:state:${state.stateVersion.toString()}:blocked`,
        payload: { conversationId }
      }, now);
    },
    async deleteBlock(conversationId, blockerUserId, blockedUserId, now) {
      await tx.messagingBlock.deleteMany({ where: { blockerUserId, blockedUserId } });
      const state = await incrementConversationState(tx, conversationId);
      await createConversationRealtimeRows(tx, {
        conversationId,
        recipientUserIds: [blockerUserId, blockedUserId],
        eventKey: `${conversationId}:state:${state.stateVersion.toString()}:unblocked`,
        payload: { conversationId }
      }, now);
    },
    async setParticipantArchived(userId, conversationId, archived, now) {
      const updated = await tx.conversationParticipant.updateMany({
        where: { conversationId, userId },
        data: { archivedAt: archived ? now : null }
      });
      if (updated.count === 1) {
        const state = await incrementConversationState(tx, conversationId);
        await createConversationRealtimeRows(tx, {
          conversationId,
          recipientUserIds: [userId],
          eventKey: `${conversationId}:state:${state.stateVersion.toString()}:${archived ? "archived" : "restored"}`,
          payload: { conversationId }
        }, now);
      }
      return updated.count === 1;
    },
    async advanceReadCursor(userId, conversationId, throughSequence, now) {
      const updated = await tx.conversationParticipant.updateMany({
        where: { conversationId, userId, lastReadSequence: { lt: throughSequence } },
        data: { lastReadSequence: throughSequence }
      });
      if (updated.count === 1) {
        const state = await incrementConversationState(tx, conversationId);
        await createConversationRealtimeRows(tx, {
          conversationId,
          recipientUserIds: [userId],
          eventKey: `${conversationId}:state:${state.stateVersion.toString()}:read`,
          payload: { conversationId }
        }, now);
      }
      return updated.count === 1;
    },
    async createAcceptedMessage(input) {
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          kind: "TEXT",
          body: input.body,
          clientRequestId: input.clientRequestId
        }
      });
      const [, senderRead, recipientArchive] = await Promise.all([
        tx.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: input.now } }),
        input.advanceSenderReadCursor
          ? tx.conversationParticipant.updateMany({
            where: { conversationId: input.conversationId, userId: input.senderUserId, lastReadSequence: { lt: message.sequence } },
            data: { lastReadSequence: message.sequence }
          })
          : undefined,
        input.clearRecipientArchive
          ? tx.conversationParticipant.updateMany({
            where: { conversationId: input.conversationId, userId: { not: input.senderUserId } },
            data: { archivedAt: null }
          })
          : undefined
      ]);
      const increment = 1n + (senderRead && senderRead.count > 0 ? 1n : 0n) + (recipientArchive && recipientArchive.count > 0 ? 1n : 0n);
      await tx.conversation.update({ where: { id: input.conversationId }, data: { stateVersion: { increment } } });
      const record = await findConversationRecord(tx, input.senderUserId, { id: input.conversationId });
      if (!record) throw new Error("Saved messaging conversation could not be loaded");
      return { conversation: record, message };
    },
    async createRecipientDelivery(input) {
      await tx.messagingDeliveryOutbox.create({
        data: {
          eventKey: input.eventKey,
          deliveryKind: input.deliveryKind,
          conversationId: input.conversationId,
          messageId: input.messageId,
          recipientUserId: input.recipientUserId,
          payload: input.payload,
          createdAt: input.now,
          nextAttemptAt: input.nextAttemptAt
        }
      });
    }
  };
}

async function listConversations(database: typeof prisma, actorUserId: string, input: ConversationListInput) {
  return database.$transaction(
    (tx) => listConversationSnapshot(tx, actorUserId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

async function listConversationSnapshot(database: TransactionClient, actorUserId: string, input: ConversationListInput) {
  const cursor = input.cursor ? decodeConversationCursor(input.cursor) : null;
  const rows = await database.conversation.findMany({
    where: {
      ...participantMembership(actorUserId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.archived === undefined ? {} : { participants: { some: { userId: actorUserId, archivedAt: input.archived ? { not: null } : null } } }),
      ...(cursor ? { OR: [{ lastMessageAt: { lt: cursor.lastMessageAt } }, { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } }] } : {})
    },
    include: conversationInboxInclude(actorUserId),
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: input.limit + 1
  });
  const page = rows.slice(0, input.limit);
  const records = await attachConversationMetadata(database, actorUserId, page);
  const final = page.at(-1);
  const maximum = await database.message.findFirst({
    where: { conversation: participantMembership(actorUserId) },
    orderBy: { sequence: "desc" },
    select: { sequence: true }
  });
  return {
    conversations: records,
    nextCursor: rows.length > input.limit && final ? encodeConversationCursor(final.lastMessageAt, final.id) : null,
    syncSequence: maximum?.sequence ?? 0n
  };
}

async function listMessages(database: typeof prisma, actorUserId: string, conversationId: string, input: MessagePageInput) {
  const rows = await database.message.findMany({
    where: {
      conversationId,
      conversation: participantMembership(actorUserId),
      ...(input.beforeSequence ? { sequence: { lt: BigInt(input.beforeSequence) } } : {}),
      ...(input.afterSequence ? { sequence: { gt: BigInt(input.afterSequence) } } : {})
    },
    orderBy: { sequence: input.beforeSequence ? "desc" : "asc" },
    take: input.limit + 1
  });
  const page = rows.slice(0, input.limit);
  const messages = input.beforeSequence ? page.reverse() : page;
  const nextSequence = rows.length > input.limit
    ? (input.beforeSequence ? messages[0]?.sequence : messages.at(-1)?.sequence) ?? null
    : null;
  return { messages, nextSequence, hasMore: rows.length > input.limit };
}

async function getRealtimeMessage(database: typeof prisma, actorUserId: string, conversationId: string, messageId: string) {
  return database.message.findFirst({
    where: {
      id: messageId,
      conversationId,
      conversation: participantMembership(actorUserId)
    }
  });
}

async function syncMessages(database: typeof prisma, actorUserId: string, input: SyncInput) {
  const rows = await database.message.findMany({
    where: { sequence: { gt: BigInt(input.afterSequence) }, conversation: participantMembership(actorUserId) },
    orderBy: { sequence: "asc" },
    take: input.limit + 1
  });
  const page = rows.slice(0, input.limit);
  return { messages: page, nextSequence: page.at(-1)?.sequence ?? null, hasMore: rows.length > input.limit };
}

async function getUnreadSummary(database: typeof prisma, actorUserId: string): Promise<UnreadSummaryDto> {
  const [aggregate, pendingRequests] = await Promise.all([
    database.$queryRaw<Array<{ unreadMessages: bigint }>>(Prisma.sql`
      SELECT COUNT(message."id")::bigint AS "unreadMessages"
      FROM "ConversationParticipant" AS participant
      JOIN "Message" AS message
        ON message."conversationId" = participant."conversationId"
       AND message."sequence" > participant."lastReadSequence"
       AND message."senderUserId" <> ${actorUserId}
      WHERE participant."userId" = ${actorUserId}
    `),
    database.conversation.count({ where: { status: "PENDING", participants: { some: { userId: actorUserId, role: "TECH" } } } })
  ]);
  const unreadMessages = Number(aggregate[0]?.unreadMessages ?? 0n);
  return { unreadMessages, pendingRequests, total: unreadMessages + pendingRequests };
}

async function claimDeliveryBatch(
  database: typeof prisma,
  now: Date,
  options: { includeEmail: boolean }
): Promise<ClaimedMessagingDelivery[]> {
  const leaseExpiredBefore = new Date(now.getTime() - MESSAGING_DELIVERY_LEASE_MS);
  // Prisma stores these timestamp-without-time-zone columns as UTC, while raw
  // Date parameters are timestamptz. Normalize explicitly for non-UTC sessions.
  const deliveryFilter = options.includeEmail
    ? Prisma.empty
    : Prisma.sql`AND "deliveryKind" IN ('REALTIME_MESSAGE', 'REALTIME_CONVERSATION')`;
  return database.$transaction((tx) => tx.$queryRaw<ClaimedMessagingDelivery[]>(Prisma.sql`
    WITH due AS (
      SELECT "id"
      FROM "MessagingDeliveryOutbox"
      WHERE "processedAt" IS NULL
        ${deliveryFilter}
        AND "nextAttemptAt" IS NOT NULL
        AND "attempts" < 8
        AND "nextAttemptAt" <= (${now} AT TIME ZONE 'UTC')
        AND ("leasedAt" IS NULL OR "leasedAt" <= (${leaseExpiredBefore} AT TIME ZONE 'UTC'))
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "MessagingDeliveryOutbox" AS outbox
    SET "leasedAt" = (${now} AT TIME ZONE 'UTC'), "attempts" = outbox."attempts" + 1, "updatedAt" = (${now} AT TIME ZONE 'UTC')
    FROM due
    WHERE outbox."id" = due."id"
    RETURNING outbox."id", outbox."eventKey", outbox."deliveryKind", outbox."conversationId", outbox."messageId",
      outbox."recipientUserId", outbox."payload", outbox."attempts", outbox."leasedAt"
  `));
}

async function getDeliveryHealth(database: typeof prisma, now: Date) {
  const aggregate = await database.messagingDeliveryOutbox.aggregate({
    where: { processedAt: null, nextAttemptAt: { not: null } },
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { attempts: true }
  });
  return {
    pendingDepth: aggregate._count._all,
    oldestAgeMs: aggregate._min.createdAt ? Math.max(0, now.getTime() - aggregate._min.createdAt.getTime()) : null,
    attempts: aggregate._max.attempts ?? 0
  };
}

function completeDelivery(database: typeof prisma, id: string, leasedAt: Date, now: Date) {
  return database.messagingDeliveryOutbox.updateMany({
    where: { id, leasedAt, processedAt: null },
    data: { processedAt: now, leasedAt: null, nextAttemptAt: null, lastError: null }
  });
}

async function completeEmailDelivery(
  database: typeof prisma,
  id: string,
  leasedAt: Date,
  now: Date,
  updateLastEmailAlert: boolean
) {
  await database.$transaction(async (tx) => {
    const delivery = updateLastEmailAlert
      ? await tx.messagingDeliveryOutbox.findUnique({ where: { id }, select: { conversationId: true, recipientUserId: true } })
      : null;
    const completed = await tx.messagingDeliveryOutbox.updateMany({
      where: { id, leasedAt, processedAt: null },
      data: { processedAt: now, leasedAt: null, nextAttemptAt: null, lastError: null }
    });
    if (completed.count !== 1 || !delivery) return;
    await tx.conversationParticipant.updateMany({
      where: {
        conversationId: delivery.conversationId,
        userId: delivery.recipientUserId,
        emailAlertReservationDeliveryId: id
      },
      data: {
        lastEmailAlertAt: now,
        emailAlertReservationDeliveryId: null,
        emailAlertReservedAt: null
      }
    });
  });
}

function retryDelivery(database: typeof prisma, id: string, leasedAt: Date, nextAttemptAt: Date | null, lastError: string) {
  return database.$transaction(async (tx) => {
    const delivery = await tx.messagingDeliveryOutbox.findFirst({
      where: { id, leasedAt, processedAt: null },
      select: { conversationId: true, recipientUserId: true }
    });
    if (!delivery) return;
    await tx.conversationParticipant.updateMany({
      where: {
        conversationId: delivery.conversationId,
        userId: delivery.recipientUserId,
        emailAlertReservationDeliveryId: id
      },
      data: { emailAlertReservationDeliveryId: null, emailAlertReservedAt: null }
    });
    await tx.messagingDeliveryOutbox.updateMany({
      where: { id, leasedAt, processedAt: null },
      data: { leasedAt: null, nextAttemptAt, lastError }
    });
  });
}

async function publishRealtimeDelivery(database: typeof prisma, delivery: ClaimedMessagingDelivery, now: Date) {
  const notification = JSON.stringify({
    eventKey: delivery.eventKey,
    kind: delivery.deliveryKind === "REALTIME_MESSAGE" ? "message" : "conversation",
    conversationId: delivery.conversationId,
    ...(delivery.messageId ? { messageId: delivery.messageId } : {}),
    recipientUserId: delivery.recipientUserId
  });
  await database.$transaction(async (tx) => {
    const completed = await tx.messagingDeliveryOutbox.updateMany({
      where: { id: delivery.id, leasedAt: delivery.leasedAt, processedAt: null },
      data: { processedAt: now, leasedAt: null, nextAttemptAt: null, lastError: null }
    });
    if (completed.count !== 1) return;
    await tx.$queryRaw(Prisma.sql`SELECT pg_notify('messaging_events', ${notification})::text`);
  });
}

async function prepareEmailDelivery(
  database: typeof prisma,
  id: string,
  leasedAt: Date,
  now: Date
): Promise<MessagingDeliveryPreparation | null> {
  return database.$transaction(async (tx) => {
    const renewed = await tx.messagingDeliveryOutbox.updateMany({
      where: { id, leasedAt, processedAt: null },
      data: { leasedAt: now }
    });
    if (renewed.count !== 1) return null;
    const loaded = await loadDeliveryEmailContext(tx, id);
    if (!loaded) return { context: null, leasedAt: now, send: true };
    if (loaded.deliveryKind !== "EMAIL_MESSAGE") return { context: loaded.context, leasedAt: now, send: true };
    const context = loaded.context;
    if (context.messageSequence !== null && (
      context.lastReadSequence >= context.messageSequence ||
      context.lastEmailAlertAt !== null && context.lastEmailAlertAt > new Date(now.getTime() - 15 * 60_000)
    )) {
      return { context, leasedAt: now, send: false };
    }
    const reservationExpiredBefore = new Date(now.getTime() - MESSAGING_DELIVERY_LEASE_MS);
    const reserved = await tx.conversationParticipant.updateMany({
      where: {
        conversationId: loaded.conversationId,
        userId: loaded.recipientUserId,
        OR: [
          { emailAlertReservationDeliveryId: null },
          { emailAlertReservationDeliveryId: id },
          { emailAlertReservedAt: { lte: reservationExpiredBefore } }
        ],
        AND: [{ OR: [
          { lastEmailAlertAt: null },
          { lastEmailAlertAt: { lte: new Date(now.getTime() - 15 * 60_000) } }
        ] }]
      },
      data: { emailAlertReservationDeliveryId: id, emailAlertReservedAt: now }
    });
    return { context, leasedAt: now, send: reserved.count === 1 };
  });
}

async function loadDeliveryEmailContext(
  database: Pick<typeof prisma, "messagingDeliveryOutbox">,
  id: string
): Promise<{
  context: MessagingDeliveryEmailContext;
  deliveryKind: MessagingDeliveryKind;
  conversationId: string;
  recipientUserId: string;
} | null> {
  const delivery = await database.messagingDeliveryOutbox.findUnique({
    where: { id },
    select: {
      deliveryKind: true,
      conversationId: true,
      recipientUserId: true,
      payload: true,
      recipient: { select: { email: true, fullName: true } },
      message: { select: { sequence: true } },
      conversation: {
        select: {
          customerId: true,
          customer: { select: { fullName: true } },
          techProfile: { select: { displayName: true, businessName: true } },
          participants: { select: { userId: true, role: true, lastReadSequence: true, lastEmailAlertAt: true } }
        }
      }
    }
  });
  if (!delivery) return null;
  const participant = delivery.conversation.participants.find((candidate) => candidate.userId === delivery.recipientUserId);
  if (!participant || (participant.role !== "CUSTOMER" && participant.role !== "TECH")) return null;
  const senderDisplayName = delivery.recipientUserId === delivery.conversation.customerId
    ? delivery.conversation.techProfile.displayName || delivery.conversation.techProfile.businessName
    : delivery.conversation.customer.fullName ?? "Customer";
  return { context: {
    recipientEmail: delivery.recipient.email,
    recipientDisplayName: participant.role === "TECH"
      ? delivery.conversation.techProfile.displayName || delivery.conversation.techProfile.businessName
      : delivery.recipient.fullName,
    recipientRole: participant.role,
    senderDisplayName,
    messageSequence: delivery.message?.sequence ?? null,
    lastReadSequence: participant.lastReadSequence,
    lastEmailAlertAt: participant.lastEmailAlertAt,
    decision: readDeliveryDecision(delivery.deliveryKind, delivery.payload)
  }, deliveryKind: delivery.deliveryKind, conversationId: delivery.conversationId, recipientUserId: delivery.recipientUserId };
}

function readDeliveryDecision(deliveryKind: MessagingDeliveryKind, payload: Prisma.JsonValue) {
  if (deliveryKind !== "EMAIL_DECISION" || !isJsonRecord(payload)) return undefined;
  return payload.status === "ACCEPTED" || payload.status === "DECLINED" ? payload.status : undefined;
}

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findConversationRecord(tx: TransactionClient, actorUserId: string, where: Prisma.ConversationWhereInput): Promise<ConversationRecord | null> {
  const conversation = await tx.conversation.findFirst({
    where: { ...where, ...participantMembership(actorUserId) },
    include: conversationInboxInclude(actorUserId)
  });
  if (!conversation) return null;
  return (await attachConversationMetadata(tx, actorUserId, [conversation]))[0] ?? null;
}

async function attachConversationMetadata(
  database: Pick<typeof prisma, "messagingBlock" | "message"> | TransactionClient,
  actorUserId: string,
  conversations: Array<{
    id: string;
    customerId: string;
    techProfileId: string;
    status: ConversationStatus;
    requestedAt: Date;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    lastMessageAt: Date;
    stateVersion: bigint;
    customer: { id: string; fullName: string | null; avatarUrl: string | null };
    techProfile: { id: string; userId: string; businessName: string; displayName: string; user: { id: string; fullName: string | null; avatarUrl: string | null } };
    participants: Array<{ userId: string; role: UserRole; lastReadSequence: bigint; archivedAt: Date | null }>;
    messages: MessageRecord[];
  }>
): Promise<ConversationRecord[]> {
  if (!conversations.length) return [];
  const counterpartIds = conversations.map((conversation) => conversation.customerId === actorUserId ? conversation.techProfile.userId : conversation.customerId);
  const blocks = await database.messagingBlock.findMany({
    where: { OR: [{ blockerUserId: actorUserId, blockedUserId: { in: counterpartIds } }, { blockedUserId: actorUserId, blockerUserId: { in: counterpartIds } }] },
    select: { blockerUserId: true, blockedUserId: true }
  });
  const blockedCounterparts = new Set(blocks.map((block) => block.blockerUserId === actorUserId ? block.blockedUserId : block.blockerUserId));
  return Promise.all(conversations.map(async (conversation) => {
    const participant = conversation.participants[0];
    if (!participant) throw new Error("Messaging conversation participant is missing");
    const counterpart = conversation.customerId === actorUserId
      ? { userId: conversation.techProfile.userId, displayName: conversation.techProfile.displayName || conversation.techProfile.businessName, avatarUrl: conversation.techProfile.user.avatarUrl }
      : { userId: conversation.customer.id, displayName: conversation.customer.fullName ?? "Customer", avatarUrl: conversation.customer.avatarUrl };
    const unreadCount = await database.message.count({
      where: { conversationId: conversation.id, senderUserId: { not: actorUserId }, sequence: { gt: participant.lastReadSequence } }
    });
    return {
      id: conversation.id,
      customerId: conversation.customerId,
      techProfileId: conversation.techProfileId,
      status: conversation.status,
      requestedAt: conversation.requestedAt,
      acceptedAt: conversation.acceptedAt,
      declinedAt: conversation.declinedAt,
      lastMessageAt: conversation.lastMessageAt,
      counterpart,
      lastMessage: conversation.messages[0] ?? null,
      unreadCount,
      archivedAt: participant.archivedAt,
      isBlocked: blockedCounterparts.has(counterpart.userId),
      stateVersion: conversation.stateVersion
    };
  }));
}

function incrementConversationState(tx: TransactionClient, conversationId: string) {
  return tx.conversation.update({ where: { id: conversationId }, data: { stateVersion: { increment: 1n } } });
}

function createConversationRealtimeRows(
  tx: TransactionClient,
  input: {
    conversationId: string;
    recipientUserIds: string[];
    eventKey: string;
    payload: Prisma.InputJsonValue;
  },
  now: Date
) {
  return tx.messagingDeliveryOutbox.createMany({
    data: [...new Set(input.recipientUserIds)].map((recipientUserId) => ({
      eventKey: `${input.eventKey}:realtime:${recipientUserId}`,
      deliveryKind: "REALTIME_CONVERSATION" as const,
      conversationId: input.conversationId,
      recipientUserId,
      payload: input.payload,
      createdAt: now
    }))
  });
}

function isCanonicalParticipantPair(
  participants: Array<{ userId: string; role: UserRole }>,
  customerUserId: string,
  techUserId: string
) {
  return participants.length === 2
    && participants.some((participant) => participant.userId === customerUserId && participant.role === "CUSTOMER")
    && participants.some((participant) => participant.userId === techUserId && participant.role === "TECH");
}

function encodeConversationCursor(lastMessageAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ lastMessageAt: lastMessageAt.toISOString(), id })).toString("base64url");
}

function decodeConversationCursor(cursor: string): { lastMessageAt: Date; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid conversation cursor");
    const value = parsed as { lastMessageAt?: unknown; id?: unknown };
    const lastMessageAt = typeof value.lastMessageAt === "string" ? new Date(value.lastMessageAt) : null;
    if (!lastMessageAt || Number.isNaN(lastMessageAt.getTime()) || typeof value.id !== "string" || !value.id) throw new Error("Invalid conversation cursor");
    return { lastMessageAt, id: value.id };
  } catch {
    throw new Error("Invalid conversation cursor");
  }
}
