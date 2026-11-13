/** Owns the dedicated PostgreSQL LISTEN connection for identifier-only messaging fan-out. */
import { Client, type Notification } from "pg";
import { z } from "zod";
import { messagingTelemetry, type MessagingTelemetry } from "../services/messaging-observability";

const messagingChannel = "messaging_events";
const identifier = z.string().uuid();
const messagingBusEventSchema = z.object({
  eventKey: z.string().min(1).max(512),
  kind: z.enum(["message", "conversation", "unread"]),
  recipientUserId: identifier,
  conversationId: identifier,
  messageId: identifier.optional()
}).strict().superRefine((event, context) => {
  if (event.kind === "message" && !event.messageId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Message events require a message identifier" });
  }
});

export type MessagingBusEvent = z.infer<typeof messagingBusEventSchema>;

type MessagingBusLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

type ListenerClient = {
  connect(): Promise<unknown>;
  query(query: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "notification", listener: (notification: Notification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  off(event: "notification", listener: (notification: Notification) => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
};

type StartMessagingEventBusOptions = {
  connectionString: string;
  onEvent(event: MessagingBusEvent): void | Promise<void>;
  clientFactory?: (connectionString: string) => ListenerClient;
  logger?: MessagingBusLogger;
  telemetry?: Pick<MessagingTelemetry, "recordListener">;
  reconnectDelayMs?: number;
};

export async function startMessagingEventBus({
  connectionString,
  onEvent,
  clientFactory = (value) => new Client({ connectionString: value }),
  logger = console,
  telemetry = messagingTelemetry,
  reconnectDelayMs = 1_000
}: StartMessagingEventBusOptions): Promise<() => Promise<void>> {
  let stopped = false;
  let client: ListenerClient | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const transitions = new Set<Promise<void>>();

  const retainTransition = (transition: Promise<void>) => {
    transitions.add(transition);
    void transition.then(
      () => transitions.delete(transition),
      () => transitions.delete(transition)
    );
    return transition;
  };

  const handleNotification = (notification: Notification) => {
    if (notification.channel !== messagingChannel || !notification.payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(notification.payload);
    } catch {
      logger.warn("Messaging event bus rejected a malformed notification");
      return;
    }
    const result = messagingBusEventSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn("Messaging event bus rejected a malformed notification");
      return;
    }
    void Promise.resolve(onEvent(result.data)).catch(() => {
      logger.error("Messaging event bus handler failed");
      telemetry.recordListener({ outcome: "failed" });
    });
  };

  const removeListeners = (target: ListenerClient) => {
    target.off("notification", handleNotification);
    target.off("error", handleError);
  };

  const closeLostClient = async (target: ListenerClient) => {
    removeListeners(target);
    try {
      await target.end();
    } catch {
      logger.error("Messaging event bus connection cleanup failed");
    }
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      const transition = retainTransition(connect(true));
      void transition.then(
        () => undefined,
        () => {
          logger.error("Messaging event bus reconnect failed");
          telemetry.recordListener({ outcome: "failed" });
          scheduleReconnect();
        }
      );
    }, reconnectDelayMs);
    reconnectTimer.unref?.();
  };

  function handleError() {
    if (stopped || !client) return;
    const lostClient = client;
    client = undefined;
    logger.error("Messaging event bus connection lost");
    telemetry.recordListener({ outcome: "disconnected" });
    const transition = retainTransition(closeLostClient(lostClient));
    void transition.then(scheduleReconnect, scheduleReconnect);
  }

  async function connect(reconnecting: boolean) {
    if (stopped) return;
    const nextClient = clientFactory(connectionString);
    nextClient.on("notification", handleNotification);
    nextClient.on("error", handleError);
    try {
      await nextClient.connect();
      if (stopped) {
        await closeLostClient(nextClient);
        return;
      }
      await nextClient.query(`LISTEN ${messagingChannel}`);
      if (stopped) {
        await closeLostClient(nextClient);
        return;
      }
      client = nextClient;
      if (reconnecting) {
        logger.info("Messaging event bus reconnected");
        telemetry.recordListener({ outcome: "reconnected" });
      }
    } catch (error) {
      removeListeners(nextClient);
      try {
        await nextClient.end();
      } catch {
        // The connection is already unusable; preserve the original startup/reconnect failure.
      }
      throw error;
    }
  }

  await connect(false);

  let stopPromise: Promise<void> | undefined;
  return () => {
    if (stopPromise) return stopPromise;
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const activeClient = client;
    client = undefined;
    if (activeClient) removeListeners(activeClient);
    stopPromise = (async () => {
      await Promise.allSettled([...transitions]);
      if (!activeClient) return;
      try {
        await activeClient.query(`UNLISTEN ${messagingChannel}`);
      } catch {
        logger.error("Messaging event bus unlisten failed");
      } finally {
        await activeClient.end();
      }
    })();
    return stopPromise;
  };
}
