/** Adapts feature-gated messaging HTTP requests to the domain service. */
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { messagingService } from "../services/messaging.service";
import { createSlidingWindowLimiter } from "../services/messaging-rate-limit.service";
import { messagingTelemetry } from "../services/messaging-observability";
import { requireCurrentUser, requireRole, type AuthUser } from "../services/session.service";
import { AppError } from "../utils/errors";
import {
  conversationIdParamSchema,
  conversationListQuerySchema,
  createMessageRequestSchema,
  markReadSchema,
  messagePageQuerySchema,
  syncQuerySchema
} from "../validations/messaging.schema";

const requestLimiter = createSlidingWindowLimiter({ limit: 10, windowMs: 24 * 60 * 60 * 1_000 });
const historyLimiter = createSlidingWindowLimiter({ limit: 120, windowMs: 60_000 });
const lifecycleLimiter = createSlidingWindowLimiter({ limit: 30, windowMs: 60_000 });

export async function getMessagingStatus(_request: Request, response: Response) {
  response.json({ data: { enabled: env.MESSAGING_ENABLED } });
}

export async function createMessageRequest(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    const input = createMessageRequestSchema.parse(request.body);
    const replay = await messagingService.findAuthorizedRequestReplay(user.id, input);
    if (replay) {
      response.json({ data: { conversation: replay.conversation, message: replay.message } });
      return;
    }
    consume(requestLimiter, user.id, "Too many messaging requests. Please try again later.", "http_request", user.id);
    const result = await messagingService.createRequest(user.id, input);
    response.status(result.replayed ? 200 : 201).json({ data: { conversation: result.conversation, message: result.message } });
  } catch (error) {
    next(error);
  }
}

export async function getConversations(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const query = conversationListQuerySchema.parse(request.query);
    consume(historyLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_history", actor.id);
    response.json({ data: await messagingService.listConversations(actor, { ...query, archived: query.archived === "true" }) });
  } catch (error) {
    next(error);
  }
}

export async function getUnreadSummary(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    response.json({ data: await messagingService.getUnreadSummary(actor) });
  } catch (error) {
    next(error);
  }
}

export async function syncMessages(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const query = syncQuerySchema.parse(request.query);
    consume(historyLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_sync", actor.id);
    response.json({ data: await messagingService.syncMessages(actor, query) });
  } catch (error) {
    next(error);
  }
}

export async function getMessages(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    const query = messagePageQuerySchema.parse(request.query);
    consume(historyLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_history", actor.id, conversationId);
    response.json({ data: await messagingService.listMessages(actor, conversationId, query) });
  } catch (error) {
    next(error);
  }
}

export async function acceptMessageRequest(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getTechActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_lifecycle", actor.id, conversationId);
    response.json({ data: { conversation: await messagingService.acceptRequest(actor, conversationId) } });
  } catch (error) {
    next(error);
  }
}

export async function declineMessageRequest(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getTechActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_lifecycle", actor.id, conversationId);
    response.json({ data: { conversation: await messagingService.declineRequest(actor, conversationId) } });
  } catch (error) {
    next(error);
  }
}

export async function markMessagesRead(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    const { throughSequence } = markReadSchema.parse(request.body);
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_read", actor.id, conversationId);
    response.json({ data: await messagingService.markRead(actor, conversationId, throughSequence) });
  } catch (error) {
    next(error);
  }
}

export async function archiveConversation(request: Request, response: Response, next: NextFunction) {
  return setConversationArchived(request, response, next, true);
}

export async function restoreConversation(request: Request, response: Response, next: NextFunction) {
  return setConversationArchived(request, response, next, false);
}

export async function blockConversation(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const { conversationId } = conversationIdParamSchema.parse(request.body);
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_block", actor.id, conversationId);
    response.json({ data: { conversation: await messagingService.blockConversation(actor.id, conversationId) } });
  } catch (error) {
    next(error);
  }
}

export async function unblockConversation(request: Request, response: Response, next: NextFunction) {
  try {
    const actor = await getMessagingActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_block", actor.id, conversationId);
    response.json({ data: { conversation: await messagingService.unblockConversation(actor.id, conversationId) } });
  } catch (error) {
    next(error);
  }
}

async function setConversationArchived(request: Request, response: Response, next: NextFunction, archived: boolean) {
  try {
    const actor = await getMessagingActor(request);
    const conversationId = conversationIdParamSchema.parse(request.params).conversationId;
    consume(lifecycleLimiter, actor.id, "Too many messaging requests. Please try again later.", "http_archive", actor.id, conversationId);
    response.json({ data: await messagingService.setArchived(actor.id, conversationId, archived) });
  } catch (error) {
    next(error);
  }
}

async function getMessagingActor(request: Request) {
  return toMessagingActor(await requireCurrentUser(request.headers.cookie));
}

async function getTechActor(request: Request) {
  return toMessagingActor(await requireRole(request.headers.cookie, ["TECH"]));
}

function toMessagingActor(user: AuthUser) {
  if (user.role !== "CUSTOMER" && user.role !== "TECH") {
    throw new AppError("Insufficient permissions", 403, "forbidden");
  }
  return { id: user.id, role: user.role };
}

function consume(
  limiter: ReturnType<typeof createSlidingWindowLimiter>,
  key: string,
  message: string,
  scope: string,
  actorUserId: string,
  conversationId?: string
) {
  const result = limiter.consume(key);
  if (!result.allowed) {
    messagingTelemetry.recordRateLimit({ scope, actorUserId, conversationId, retryAfterSeconds: result.retryAfterSeconds });
    throw new AppError(message, 429, "messaging_rate_limited", { retryAfterSeconds: result.retryAfterSeconds });
  }
}
