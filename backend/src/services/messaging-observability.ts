/** Records identifier-only messaging operational events. */
export type MessagingLogger = {
  info(event: string, fields: object): void;
};

export type MessagingTelemetry = ReturnType<typeof createMessagingTelemetry>;

export type MessagingWriteOutcome =
  | "created"
  | "replayed"
  | "accepted"
  | "declined"
  | "archived"
  | "unarchived"
  | "blocked"
  | "unblocked"
  | "request_pending"
  | "request_cooldown"
  | "request_not_pending"
  | "client_request_id_reused"
  | "messaging_blocked"
  | "forbidden"
  | "not_found"
  | "failed";
type SocketOutcome = "connected" | "authentication_failed" | "reconnected";
type DeliveryOutcome = "published" | "sent" | "skipped" | "retried" | "terminal_failed";

export function createMessagingTelemetry(logger: MessagingLogger = console) {
  let lastPendingDepth = 0;
  let lastAttempts = 0;
  return {
    recordWrite(input: { actorUserId: string; conversationId?: string; outcome: MessagingWriteOutcome; durationMs: number }) {
      logger.info("messaging.write", input);
    },
    recordSocket(input: { actorUserId?: string; outcome: SocketOutcome; durationMs: number }) {
      logger.info("messaging.socket", input);
    },
    recordCatchUp(input: { actorUserId: string; outcome: "completed" | "failed"; durationMs: number; messageCount: number }) {
      logger.info("messaging.catch_up", input);
    },
    recordDeliveryHealth(input: { pendingDepth: number; oldestAgeMs: number | null; attempts: number }) {
      // Polling an idle or unchanged queue is not an event. Keep the current
      // age in change reports without logging every time the queue gets older.
      if (input.pendingDepth === lastPendingDepth && input.attempts === lastAttempts) return;
      logger.info("messaging.delivery.health", input);
      lastPendingDepth = input.pendingDepth;
      lastAttempts = input.attempts;
    },
    recordDelivery(input: { deliveryId: string; conversationId: string; deliveryKind: string; outcome: DeliveryOutcome; durationMs: number; attempts: number }) {
      logger.info("messaging.delivery.result", input);
    },
    recordFanOut(input: { recipientUserId: string; conversationId: string; eventKind: "message" | "conversation" | "unread"; outcome: "published" | "failed"; durationMs: number }) {
      logger.info("messaging.fan_out", input);
    },
    recordListener(input: { outcome: "disconnected" | "reconnected" | "failed" }) {
      logger.info("messaging.listener", input);
    },
    recordRateLimit(input: { scope: string; actorUserId?: string; conversationId?: string; retryAfterSeconds?: number }) {
      logger.info("messaging.rate_limit", input);
    }
  };
}

export const messagingTelemetry = createMessagingTelemetry();
