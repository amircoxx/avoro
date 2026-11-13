/** Enforces customer-to-tech request, decision, archive, and block rules. */
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import {
  messagingModel,
  toConversationDto,
  toMessageDto,
  type MessagingModel,
  type MessagingTransactionStore
} from "../models/messaging.model";
import { AppError } from "../utils/errors";
import { createMessageRequestSchema } from "../validations/messaging.schema";
import { messagingTelemetry, type MessagingTelemetry, type MessagingWriteOutcome } from "./messaging-observability";
import type { ConversationPageDto, MessagePageDto, MessagingActor, SyncPageDto, UnreadSummaryDto } from "./messaging.types";

export type CreateMessageRequestInput = z.infer<typeof createMessageRequestSchema>;
export type SendMessageInput = { conversationId: string; body: string; clientRequestId: string };
type MessagingRequestContext = Exclude<Awaited<ReturnType<MessagingTransactionStore["findRequestContext"]>>, null>;

const declineCooldownMs = 30 * 24 * 60 * 60 * 1_000;
const messageEmailDelayMs = 2 * 60 * 1_000;
const maxTransactionAttempts = 3;

export function createMessagingService(
  model: MessagingModel = messagingModel,
  telemetry: MessagingTelemetry = messagingTelemetry
) {
  return {
    async findAuthorizedRequestReplay(customerId: string, input: CreateMessageRequestInput) {
      return runSerializableTransaction(model, async (store) => {
        const { replay } = await loadAuthorizedRequestReplay(store, customerId, input);
        return replay ? toRequestDto(replay) : null;
      });
    },

    async createRequest(customerId: string, input: CreateMessageRequestInput, now = new Date()) {
      return recordWrite(telemetry, customerId, undefined, async () => {
        const result = await createRequestWithReplay(model, customerId, input, now);
        return { ...toRequestDto(result), outcome: result.replayed ? "replayed" : "created" };
      });
    },

    async acceptRequest(actor: MessagingActor, conversationId: string, now = new Date()) {
      return transitionRequest(model, telemetry, actor, conversationId, "ACCEPTED", now);
    },

    async declineRequest(actor: MessagingActor, conversationId: string, now = new Date()) {
      return transitionRequest(model, telemetry, actor, conversationId, "DECLINED", now);
    },

    async setArchived(actorUserId: string, conversationId: string, archived: boolean, now = new Date()) {
      return recordWrite(telemetry, actorUserId, conversationId, async () => {
        const result = await runSerializableTransaction(model, async (store) => {
          await requireCanonicalConversationAccess(store, actorUserId, conversationId);
          const changed = await store.setParticipantArchived(actorUserId, conversationId, archived, now);
          if (!changed) throw notFoundError();
          const canonical = await requireCanonicalConversationAccess(store, actorUserId, conversationId);
          return { conversation: canonical.conversation, archived };
        });
        return { ...toArchiveDto(result), outcome: archived ? "archived" : "unarchived" };
      });
    },

    async blockConversation(actorUserId: string, conversationId: string, now = new Date()) {
      return updateBlock(model, telemetry, actorUserId, conversationId, true, now);
    },

    async unblockConversation(actorUserId: string, conversationId: string, now = new Date()) {
      return updateBlock(model, telemetry, actorUserId, conversationId, false, now);
    },

    async sendMessage(actor: MessagingActor, input: SendMessageInput, now = new Date()) {
      return recordWrite(telemetry, actor.id, input.conversationId, async () => {
        const result = await sendMessageWithReplay(model, actor, input, now);
        return {
          replayed: result.replayed,
          message: toMessageDto(result.message),
          conversation: toConversationDto(result.conversation),
          outcome: result.replayed ? "replayed" : "created"
        };
      });
    },

    async listConversations(actor: MessagingActor, query: Parameters<MessagingModel["listConversations"]>[1]): Promise<ConversationPageDto> {
      const page = await model.listConversations(actor.id, query);
      return {
        conversations: page.conversations.map(toConversationDto),
        nextCursor: page.nextCursor,
        syncSequence: page.syncSequence.toString()
      };
    },

    async listMessages(actor: MessagingActor, conversationId: string, query: Parameters<MessagingModel["listMessages"]>[2]): Promise<MessagePageDto> {
      await runSerializableTransaction(model, (store) => requireConversationAccess(store, actor.id, conversationId));
      const page = await model.listMessages(actor.id, conversationId, query);
      return toMessagePageDto(page);
    },

    async hydrateRealtimeEvent(
      actorUserId: string,
      input: { kind: "message" | "conversation" | "unread"; conversationId: string; messageId?: string }
    ) {
      if (input.kind === "unread") {
        return { unread: await model.getUnreadSummary(actorUserId) };
      }
      if (input.kind === "conversation") {
        const [conversation, unread] = await Promise.all([
          model.getRealtimeConversation(actorUserId, input.conversationId),
          model.getUnreadSummary(actorUserId)
        ]);
        return conversation ? { conversation: toConversationDto(conversation), unread } : null;
      }
      if (!input.messageId) return null;
      const [message, conversation, unread] = await Promise.all([
        model.getRealtimeMessage(actorUserId, input.conversationId, input.messageId),
        model.getRealtimeConversation(actorUserId, input.conversationId),
        model.getUnreadSummary(actorUserId)
      ]);
      return message && conversation
        ? { message: toMessageDto(message), conversation: toConversationDto(conversation), unread }
        : null;
    },

    async markRead(actor: MessagingActor, conversationId: string, throughSequence: string, now = new Date()) {
      const through = BigInt(throughSequence);
      await recordWrite(telemetry, actor.id, conversationId, async () => {
        await runSerializableTransaction(model, async (store) => {
          const access = await requireCanonicalConversationAccess(store, actor.id, conversationId);
          assertActorMatchesCanonicalPair(access, actor);
          const latest = access.conversation.lastMessage?.sequence ?? 0n;
          if (through > latest) throw readCursorInvalidError();
          await store.advanceReadCursor(actor.id, conversationId, through, now);
        });
        return { outcome: "created" as const };
      });
      return { throughSequence: through.toString() };
    },

    async getUnreadSummary(actor: MessagingActor): Promise<UnreadSummaryDto> {
      return model.getUnreadSummary(actor.id);
    },

    async syncMessages(actor: MessagingActor, query: Parameters<MessagingModel["syncMessages"]>[1]): Promise<SyncPageDto> {
      const startedAt = performance.now();
      try {
        const [page, unread] = await Promise.all([model.syncMessages(actor.id, query), model.getUnreadSummary(actor.id)]);
        telemetry.recordCatchUp({
          actorUserId: actor.id,
          outcome: "completed",
          durationMs: Math.round(performance.now() - startedAt),
          messageCount: page.messages.length
        });
        return { ...toMessagePageDto(page), unread };
      } catch (error) {
        telemetry.recordCatchUp({
          actorUserId: actor.id,
          outcome: "failed",
          durationMs: Math.round(performance.now() - startedAt),
          messageCount: 0
        });
        throw error;
      }
    }
  };
}

export const messagingService = createMessagingService();

async function createRequestWithReplay(
  model: MessagingModel,
  customerId: string,
  input: CreateMessageRequestInput,
  now: Date
) {
  try {
    return await runSerializableTransaction(model, async (store) => {
      const { context, replay } = await loadAuthorizedRequestReplay(store, customerId, input);
      if (replay) return replay;
      assertNewRequestAllowed(context, now);
      return {
        replayed: false,
        ...(await store.createRequest({ customerId, ...input, now, senderReadThroughNewMessage: true }))
      };
    });
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    return runSerializableTransaction(model, async (store) => {
      const { replay } = await loadAuthorizedRequestReplay(store, customerId, input);
      if (!replay) throw error;
      return replay;
    });
  }
}

async function sendMessageWithReplay(
  model: MessagingModel,
  actor: MessagingActor,
  input: SendMessageInput,
  now: Date
) {
  try {
    return await runSerializableTransaction(model, async (store) => {
      const access = await requireCanonicalConversationAccess(store, actor.id, input.conversationId);
      assertActorMatchesCanonicalPair(access, actor);
      if (access.isBlocked) throw blockedError();
      if (access.conversation.status !== "ACCEPTED") throw requestNotAcceptedError();
      const replay = await store.findMessageByClientRequestId(actor.id, input.clientRequestId);
      if (replay) {
        if (replay.message.conversationId !== input.conversationId) throw clientRequestIdReusedError();
        return { replayed: true as const, ...replay };
      }
      const saved = await store.createAcceptedMessage({
        conversationId: input.conversationId,
        senderUserId: actor.id,
        body: input.body,
        clientRequestId: input.clientRequestId,
        now,
        clearRecipientArchive: true,
        advanceSenderReadCursor: true
      });
      const recipientUserId = saved.conversation.counterpart.userId;
      await Promise.all([
        store.createRecipientDelivery({
          eventKey: `${saved.message.id}:message:realtime:${actor.id}`,
          deliveryKind: "REALTIME_MESSAGE",
          conversationId: input.conversationId,
          messageId: saved.message.id,
          recipientUserId: actor.id,
          payload: { conversationId: input.conversationId, messageId: saved.message.id },
          now
        }),
        store.createRecipientDelivery({
          eventKey: `${saved.message.id}:message:realtime:${recipientUserId}`,
          deliveryKind: "REALTIME_MESSAGE",
          conversationId: input.conversationId,
          messageId: saved.message.id,
          recipientUserId,
          payload: { conversationId: input.conversationId, messageId: saved.message.id },
          now
        }),
        store.createRecipientDelivery({
          eventKey: `${saved.message.id}:message:email:${recipientUserId}`,
          deliveryKind: "EMAIL_MESSAGE",
          conversationId: input.conversationId,
          messageId: saved.message.id,
          recipientUserId,
          payload: { conversationId: input.conversationId, messageId: saved.message.id },
          now,
          nextAttemptAt: new Date(now.getTime() + messageEmailDelayMs)
        })
      ]);
      return { replayed: false as const, ...saved };
    });
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;
    return runSerializableTransaction(model, async (store) => {
      const access = await requireCanonicalConversationAccess(store, actor.id, input.conversationId);
      assertActorMatchesCanonicalPair(access, actor);
      if (access.isBlocked) throw blockedError();
      if (access.conversation.status !== "ACCEPTED") throw requestNotAcceptedError();
      const replay = await store.findMessageByClientRequestId(actor.id, input.clientRequestId);
      if (!replay) throw error;
      if (replay.message.conversationId !== input.conversationId) throw clientRequestIdReusedError();
      return { replayed: true as const, ...replay };
    });
  }
}

async function loadAuthorizedRequestReplay(
  store: MessagingTransactionStore,
  customerId: string,
  input: CreateMessageRequestInput
) {
  const context = await store.findRequestContext(customerId, input.techProfileId);
  assertRequestTargetAllowed(context, customerId);
  const replay = await store.findMessageByClientRequestId(customerId, input.clientRequestId);
  if (!replay) return { context, replay: null };
  if (replay.conversation.techProfileId !== input.techProfileId) throw clientRequestIdReusedError();
  return { context, replay: { replayed: true as const, conversation: replay.conversation, message: replay.message } };
}

async function transitionRequest(
  model: MessagingModel,
  telemetry: MessagingTelemetry,
  actor: MessagingActor,
  conversationId: string,
  status: "ACCEPTED" | "DECLINED",
  now: Date
) {
  return recordWrite(telemetry, actor.id, conversationId, async () => {
    const conversation = await runSerializableTransaction(model, async (store) => {
      const access = await requireCanonicalConversationAccess(store, actor.id, conversationId);
      assertActorMatchesCanonicalPair(access, actor);
      if (access.isBlocked) throw blockedError();
      if (actor.role !== "TECH" || access.participant.role !== "TECH") throw forbiddenError();
      if (access.conversation.status !== "PENDING") throw requestNotPendingError();
      const transitioned = await store.transitionRequestStatus({ actorUserId: actor.id, conversationId, status, now });
      if (!transitioned) throw requestNotPendingError();
      return transitioned;
    });
    return { ...toConversationDto(conversation), outcome: status === "ACCEPTED" ? "accepted" : "declined" };
  });
}

async function updateBlock(
  model: MessagingModel,
  telemetry: MessagingTelemetry,
  actorUserId: string,
  conversationId: string,
  blocked: boolean,
  now: Date
) {
  return recordWrite(telemetry, actorUserId, conversationId, async () => {
    const conversation = await runSerializableTransaction(model, async (store) => {
      const access = await requireCanonicalConversationAccess(store, actorUserId, conversationId);
      const counterpartUserId = access.conversation.counterpart.userId;
      if (blocked) await store.insertBlock(conversationId, actorUserId, counterpartUserId, now);
      else await store.deleteBlock(conversationId, actorUserId, counterpartUserId, now);
      return (await requireCanonicalConversationAccess(store, actorUserId, conversationId)).conversation;
    });
    return { ...toConversationDto(conversation), outcome: blocked ? "blocked" as const : "unblocked" as const };
  });
}

async function runSerializableTransaction<T>(model: MessagingModel, work: (store: MessagingTransactionStore) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= maxTransactionAttempts; attempt += 1) {
    try {
      return await model.withSerializableTransaction(work);
    } catch (error) {
      if (isSerializableWriteConflict(error) && attempt < maxTransactionAttempts) continue;
      throw error;
    }
  }
  throw new Error("Unreachable messaging transaction state");
}

async function requireConversationAccess(store: MessagingTransactionStore, actorUserId: string, conversationId: string) {
  const access = await store.findConversationAccess(actorUserId, conversationId);
  if (!access) throw notFoundError();
  return access;
}

async function requireCanonicalConversationAccess(store: MessagingTransactionStore, actorUserId: string, conversationId: string) {
  const access = await requireConversationAccess(store, actorUserId, conversationId);
  if (!access.canonicalPair) throw notFoundError();
  return access;
}

function assertActorMatchesCanonicalPair(
  access: Awaited<ReturnType<typeof requireCanonicalConversationAccess>>,
  actor: MessagingActor
) {
  const canonicalPair = access.canonicalPair;
  if (!canonicalPair) throw notFoundError();
  const expectedRole = actor.id === canonicalPair.customerUserId
    ? "CUSTOMER"
    : actor.id === canonicalPair.techUserId
      ? "TECH"
      : null;
  if (actor.role !== expectedRole) throw notFoundError();
}

function assertRequestTargetAllowed(
  context: Awaited<ReturnType<MessagingTransactionStore["findRequestContext"]>>,
  customerId: string
): asserts context is MessagingRequestContext {
  if (!context || !context.techPublished || !context.pairIsCanonical) throw notFoundError();
  if (context.techUserId === customerId) throw forbiddenError("You cannot message your own tech profile");
  if (context.isBlocked) throw blockedError();
}

function assertNewRequestAllowed(
  context: MessagingRequestContext,
  now: Date
) {
  if (context.conversation?.status === "PENDING" || context.conversation?.status === "ACCEPTED") {
    throw new AppError("A message request is already pending", 409, "request_pending");
  }
  if (context.conversation?.status === "DECLINED" && context.conversation.declinedAt) {
    const nextAllowedAt = new Date(context.conversation.declinedAt.getTime() + declineCooldownMs);
    if (now.getTime() <= nextAllowedAt.getTime()) throw cooldownError(nextAllowedAt);
  }
}

function toRequestDto(result: Awaited<ReturnType<MessagingTransactionStore["createRequest"]>> & { replayed: boolean }) {
  return {
    replayed: result.replayed,
    conversation: toConversationDto(result.conversation),
    message: toMessageDto(result.message)
  };
}

function toArchiveDto(result: { conversation: Parameters<typeof toConversationDto>[0]; archived: boolean }) {
  return { conversation: toConversationDto(result.conversation), archived: result.archived };
}

function toMessagePageDto(page: { messages: Parameters<typeof toMessageDto>[0][]; nextSequence: bigint | null; hasMore: boolean }): MessagePageDto {
  return {
    messages: page.messages.map(toMessageDto),
    nextSequence: page.nextSequence?.toString() ?? null,
    hasMore: page.hasMore
  };
}

async function recordWrite<T>(
  telemetry: MessagingTelemetry,
  actorUserId: string,
  conversationId: string | undefined,
  work: () => Promise<T & { outcome: MessagingWriteOutcome }>
): Promise<Omit<T, "outcome">> {
  const startedAt = performance.now();
  try {
    const result = await work();
    const resultConversationId = "conversation" in result && result.conversation && typeof result.conversation === "object" && "id" in result.conversation
      ? String(result.conversation.id)
      : conversationId;
    telemetry.recordWrite({
      actorUserId,
      conversationId: resultConversationId,
      outcome: result.outcome,
      durationMs: Math.round(performance.now() - startedAt)
    });
    const { outcome: _outcome, ...response } = result;
    return response;
  } catch (error) {
    telemetry.recordWrite({
      actorUserId,
      conversationId,
      outcome: toWriteOutcome(error),
      durationMs: Math.round(performance.now() - startedAt)
    });
    throw error;
  }
}

function cooldownError(nextAllowedAt: Date) {
  return new AppError(
    `You can send another message request after ${nextAllowedAt.toISOString()}`,
    409,
    "request_cooldown",
    { nextAllowedAt: nextAllowedAt.toISOString() }
  );
}

function blockedError() {
  return new AppError("Messaging is unavailable for this conversation", 403, "messaging_blocked");
}

function forbiddenError(message = "You cannot perform this messaging action") {
  return new AppError(message, 403, "forbidden");
}

function notFoundError() {
  return new AppError("Conversation not found", 404, "not_found");
}

function requestNotPendingError() {
  return new AppError("Message request is no longer pending", 409, "request_not_pending");
}

function requestNotAcceptedError() {
  return new AppError("Messages can only be sent after the request is accepted", 409, "request_not_accepted");
}

function readCursorInvalidError() {
  return new AppError("Read cursor exceeds the latest visible message", 400, "read_cursor_invalid");
}

function clientRequestIdReusedError() {
  return new AppError("Client request ID has already been used for a different tech profile", 409, "client_request_id_reused");
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function isIdempotencyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toWriteOutcome(error: unknown): MessagingWriteOutcome {
  if (!(error instanceof AppError)) return "failed";
  const knownOutcomes: MessagingWriteOutcome[] = [
    "request_pending",
    "request_cooldown",
    "request_not_pending",
    "client_request_id_reused",
    "messaging_blocked",
    "forbidden",
    "not_found"
  ];
  return knownOutcomes.includes(error.code as MessagingWriteOutcome) ? error.code as MessagingWriteOutcome : "failed";
}
