/** Adapts authenticated Socket.IO connections to the public messaging service. */
import type { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { ZodError } from "zod";
import { getCurrentUser, type AuthUser } from "../services/session.service";
import { messagingService } from "../services/messaging.service";
import { createSlidingWindowLimiter } from "../services/messaging-rate-limit.service";
import { messagingTelemetry } from "../services/messaging-observability";
import { sendMessageSchema } from "../validations/messaging.schema";
import { AppError } from "../utils/errors";
import type { MessagingBusEvent } from "./messaging-event-bus";

export type MessagingEventSource = {
  subscribe(listener: (event: MessagingBusEvent) => void | Promise<void>): () => void;
};

type RealtimeMessagingService = Pick<typeof messagingService, "sendMessage" | "hydrateRealtimeEvent">;

type AttachMessagingGatewayOptions = {
  server: HttpServer;
  eventBus: MessagingEventSource;
  service?: RealtimeMessagingService;
  frontendOrigin: string;
  enabled: boolean;
  sessionRevalidationMs?: number;
};

export type SocketAcknowledgment =
  | { ok: true; message: Awaited<ReturnType<RealtimeMessagingService["sendMessage"]>>["message"]; conversation: Awaited<ReturnType<RealtimeMessagingService["sendMessage"]>>["conversation"] }
  | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

const oneMinute = 60_000;
const defaultSessionRevalidationMs = 5 * 60_000;
const maxConcurrentSocketsPerUser = 5;

export function attachMessagingGateway({
  server,
  eventBus,
  service = messagingService,
  frontendOrigin,
  enabled,
  sessionRevalidationMs = defaultSessionRevalidationMs
}: AttachMessagingGatewayOptions) {
  const io = new SocketServer(server, {
    cors: { origin: frontendOrigin, credentials: true }
  });
  const handshakeLimiter = createSlidingWindowLimiter({ limit: 20, windowMs: oneMinute });
  const userSendLimiter = createSlidingWindowLimiter({ limit: 60, windowMs: oneMinute });
  const conversationSendLimiter = createSlidingWindowLimiter({ limit: 20, windowMs: oneMinute });
  const inFlight = new Set<Promise<void>>();
  const activeSocketsByUser = new Map<string, number>();
  let stopping = false;

  const track = (work: () => Promise<void>) => {
    if (stopping) return undefined;
    const promise = work();
    inFlight.add(promise);
    void promise.then(
      () => inFlight.delete(promise),
      () => inFlight.delete(promise)
    );
    return promise;
  };

  io.use((socket, next) => {
    const pending = track(async () => {
      const startedAt = performance.now();
      try {
        if (!enabled) throw new AppError("Messaging is unavailable", 503, "messaging_disabled");
        if (socket.handshake.headers.origin !== frontendOrigin) {
          throw new AppError("Origin is not allowed", 403, "forbidden");
        }
        const handshakeLimit = handshakeLimiter.consume(socket.handshake.address);
        if (!handshakeLimit.allowed) {
          messagingTelemetry.recordRateLimit({ scope: "socket_handshake", retryAfterSeconds: handshakeLimit.retryAfterSeconds });
          throw new AppError("Too many connection attempts", 429, "connection_rate_limited", {
            retryAfterSeconds: handshakeLimit.retryAfterSeconds
          });
        }
        const user = await getCurrentUser(socket.handshake.headers.cookie);
        if (!user) throw sessionInvalidError();
        if (user.role !== "CUSTOMER" && user.role !== "TECH") {
          throw new AppError("Insufficient permissions", 403, "forbidden");
        }
        const activeSocketCount = activeSocketsByUser.get(user.id) ?? 0;
        if (activeSocketCount >= maxConcurrentSocketsPerUser) {
          messagingTelemetry.recordRateLimit({ scope: "socket_connection_cap", actorUserId: user.id });
          throw new AppError("Too many active messaging connections", 429, "connection_limit_reached");
        }
        activeSocketsByUser.set(user.id, activeSocketCount + 1);
        let released = false;
        const releaseConnectionSlot = () => {
          if (released) return;
          released = true;
          const current = activeSocketsByUser.get(user.id) ?? 0;
          if (current <= 1) activeSocketsByUser.delete(user.id);
          else activeSocketsByUser.set(user.id, current - 1);
        };
        socket.once("disconnect", releaseConnectionSlot);
        socket.data.authenticatedUser = user;
        socket.data.sessionCookie = socket.handshake.headers.cookie;
        messagingTelemetry.recordSocket({
          actorUserId: user.id,
          outcome: socket.recovered ? "reconnected" : "connected",
          durationMs: Math.round(performance.now() - startedAt)
        });
        next();
      } catch (error) {
        messagingTelemetry.recordSocket({ outcome: "authentication_failed", durationMs: Math.round(performance.now() - startedAt) });
        next(toConnectionError(error));
      }
    });
    if (!pending) {
      next(toConnectionError(new AppError("Messaging is unavailable", 503, "messaging_disabled")));
    }
  });

  io.on("connection", (socket) => {
    const authenticatedUser = socket.data.authenticatedUser as AuthUser;
    socket.join(userRoom(authenticatedUser.id));

    let disconnected = false;
    let sessionTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSessionRevalidation = () => {
      if (stopping || disconnected) return;
      sessionTimer = setTimeout(() => {
        sessionTimer = undefined;
        const pending = track(async () => {
          try {
            await revalidateSocketUser(socket, authenticatedUser.id);
          } catch (error) {
            if (!(error instanceof AppError && error.code === "session_invalid")) invalidateSocket(socket);
          }
        });
        if (pending) void pending.then(scheduleSessionRevalidation, scheduleSessionRevalidation);
      }, sessionRevalidationMs);
      sessionTimer.unref?.();
    };
    scheduleSessionRevalidation();
    socket.once("disconnect", () => {
      disconnected = true;
      if (sessionTimer) clearTimeout(sessionTimer);
    });

    socket.on("message:send", (raw: unknown, acknowledge?: (result: SocketAcknowledgment) => void) => {
      if (typeof acknowledge !== "function") return;
      void track(async () => {
        try {
          consumeSendLimit(userSendLimiter, authenticatedUser.id, "Too many messages. Please try again later.", "socket_user_send", authenticatedUser.id);
          const current = await revalidateSocketUser(socket, authenticatedUser.id);
          const input = sendMessageSchema.parse(raw);
          consumeSendLimit(conversationSendLimiter, input.conversationId, "Too many messages in this conversation. Please try again later.", "socket_conversation_send", authenticatedUser.id, input.conversationId);
          const result = await service.sendMessage({ id: current.id, role: current.role as "CUSTOMER" | "TECH" }, input);
          acknowledge({ ok: true, message: result.message, conversation: result.conversation });
        } catch (error) {
          acknowledge({ ok: false, error: toSocketError(error) });
        }
      });
    });
  });

  const unsubscribe = eventBus.subscribe((event) => {
    void track(async () => {
      const startedAt = performance.now();
      try {
        const hydrated = await service.hydrateRealtimeEvent(event.recipientUserId, {
          kind: event.kind,
          conversationId: event.conversationId,
          ...(event.messageId ? { messageId: event.messageId } : {})
        });
        if (!hydrated) {
          messagingTelemetry.recordFanOut({
            recipientUserId: event.recipientUserId,
            conversationId: event.conversationId,
            eventKind: event.kind,
            outcome: "failed",
            durationMs: Math.round(performance.now() - startedAt)
          });
          return;
        }
        const room = io.to(userRoom(event.recipientUserId));
        if (hydrated.message) room.emit("message:created", hydrated.message);
        if (hydrated.conversation) room.emit("conversation:updated", hydrated.conversation);
        if (hydrated.unread) room.emit("unread:changed", hydrated.unread);
        messagingTelemetry.recordFanOut({
          recipientUserId: event.recipientUserId,
          conversationId: event.conversationId,
          eventKind: event.kind,
          outcome: "published",
          durationMs: Math.round(performance.now() - startedAt)
        });
      } catch {
        messagingTelemetry.recordFanOut({
          recipientUserId: event.recipientUserId,
          conversationId: event.conversationId,
          eventKind: event.kind,
          outcome: "failed",
          durationMs: Math.round(performance.now() - startedAt)
        });
      }
    });
  });

  let stopPromise: Promise<void> | undefined;
  return {
    io,
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      stopPromise = (async () => {
        unsubscribe();
        io.disconnectSockets(true);
        io.engine?.close();
        io.removeAllListeners();
        await Promise.allSettled([...inFlight]);
      })();
      return stopPromise;
    }
  };
}

async function revalidateSocketUser(socket: Socket, authenticatedUserId: string) {
  const current = await getCurrentUser(socket.data.sessionCookie as string | undefined);
  if (!current || current.id !== authenticatedUserId || (current.role !== "CUSTOMER" && current.role !== "TECH")) {
    invalidateSocket(socket);
    throw sessionInvalidError();
  }
  return current;
}

function invalidateSocket(socket: Socket) {
  if (!socket.connected) return;
  socket.emit("session:invalid");
  socket.disconnect(true);
}

function consumeSendLimit(
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
    throw new AppError(message, 429, "message_rate_limited", { retryAfterSeconds: result.retryAfterSeconds });
  }
}

function userRoom(userId: string) {
  return `user:${userId}`;
}

function sessionInvalidError() {
  return new AppError("Session is invalid", 401, "session_invalid");
}

function toConnectionError(error: unknown) {
  const socketError = toSocketError(error);
  const result = new Error(socketError.message) as Error & { data?: typeof socketError };
  result.data = socketError;
  return result;
}

function toSocketError(error: unknown): { code: string; message: string; retryAfterSeconds?: number } {
  if (error instanceof AppError) {
    const retryAfterSeconds = error.details?.retryAfterSeconds;
    return {
      code: error.code,
      message: error.message,
      ...(typeof retryAfterSeconds === "number" ? { retryAfterSeconds } : {})
    };
  }
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "Invalid message";
    return { code: message === "Message is too long" ? "message_too_long" : "bad_request", message };
  }
  return { code: "internal_error", message: "Message could not be sent" };
}
