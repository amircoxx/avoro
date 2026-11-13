/** Delivers durable messaging notifications without exposing message content. */
import {
  messagingModel,
  type ClaimedMessagingDelivery,
  type MessagingDeliveryEmailContext,
  type MessagingDeliveryPreparation,
  MESSAGING_DELIVERY_LEASE_MS,
  type MessagingModel
} from "../../models/messaging.model";
import { BrevoEmailClient, BrevoEmailError, DEFAULT_BREVO_REQUEST_TIMEOUT_MS, type EmailClient } from "../email/brevo.client";
import { renderMessagingEmail, type MessagingEmailKind } from "./messaging-email";
import { messagingTelemetry, type MessagingTelemetry } from "../messaging-observability";

type MessagingDeliveryModel = Pick<MessagingModel,
  "claimDeliveryBatch" | "publishRealtimeDelivery" | "prepareEmailDelivery" | "completeDelivery" | "completeEmailDelivery" | "retryDelivery" | "getDeliveryHealth">;

type DispatcherConfig = {
  apiKey?: string;
  sender?: { email: string; name: string };
  appPublicUrl?: string;
  enabled?: boolean;
};

export type DispatchMessagingOptions = DispatcherConfig & {
  model?: MessagingDeliveryModel;
  client?: EmailClient;
  now?: () => Date;
  telemetry?: MessagingTelemetry;
};

export async function dispatchMessagingDeliveryBatch(options: DispatchMessagingOptions): Promise<number> {
  if (options.enabled === false) return 0;
  const emailReady = Boolean(options.apiKey && options.sender && options.appPublicUrl);
  if (emailReady && MESSAGING_DELIVERY_LEASE_MS <= DEFAULT_BREVO_REQUEST_TIMEOUT_MS) {
    throw new Error("Messaging delivery lease must exceed the Brevo request timeout");
  }
  const model = options.model ?? messagingModel;
  const now = options.now ?? (() => new Date());
  const telemetry = options.telemetry ?? messagingTelemetry;
  const email = emailReady
    ? {
        client: options.client ?? new BrevoEmailClient(options.apiKey!),
        sender: options.sender!,
        appPublicUrl: options.appPublicUrl!
      }
    : undefined;
  const claimed = await model.claimDeliveryBatch(now(), { includeEmail: emailReady });
  const results = await Promise.allSettled(claimed.map((row) => dispatchClaimedRow(row, {
    model,
    email,
    now,
    telemetry
  })));
  const persistenceFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (persistenceFailure) throw persistenceFailure.reason;
  telemetry.recordDeliveryHealth(await model.getDeliveryHealth(now()));
  return claimed.length;
}

type ClaimedDispatchOptions = {
  model: MessagingDeliveryModel;
  email?: { client: EmailClient; sender: { email: string; name: string }; appPublicUrl: string };
  now: () => Date;
  telemetry: MessagingTelemetry;
};

async function dispatchClaimedRow(row: ClaimedMessagingDelivery, options: ClaimedDispatchOptions) {
  const startedAt = performance.now();
  let leasedAt = row.leasedAt;
  try {
    if (isRealtimeDelivery(row.deliveryKind)) {
      await options.model.publishRealtimeDelivery(row, options.now());
      recordDeliveryResult(options.telemetry, row, "published", startedAt);
      return;
    }
    if (!options.email) {
      recordDeliveryResult(options.telemetry, row, "skipped", startedAt);
      return;
    }
    const preparation = await options.model.prepareEmailDelivery(row.id, row.leasedAt, options.now());
    if (!preparation) {
      recordDeliveryResult(options.telemetry, row, "skipped", startedAt);
      return;
    }
    leasedAt = preparation.leasedAt;
    const outcome = await dispatchEmailDelivery(row, preparation, { ...options, email: options.email });
    recordDeliveryResult(options.telemetry, row, outcome, startedAt);
  } catch (error) {
    const retryable = isRealtimeDelivery(row.deliveryKind) || (error instanceof BrevoEmailError && error.retryable);
    const terminal = row.attempts >= 8 || !retryable;
    const failedAt = options.now();
    await options.model.retryDelivery(
      row.id,
      leasedAt,
      terminal ? null : new Date(failedAt.getTime() + Math.min(2 ** row.attempts, 60) * 60_000),
      sanitizeDeliveryError(error)
    );
    recordDeliveryResult(options.telemetry, row, terminal ? "terminal_failed" : "retried", startedAt);
  }
}

async function dispatchEmailDelivery(
  row: ClaimedMessagingDelivery,
  preparation: MessagingDeliveryPreparation,
  options: ClaimedDispatchOptions & { email: NonNullable<ClaimedDispatchOptions["email"]> }
) {
  const kind = parseEmailKind(row.deliveryKind);
  if (preparation.send === false) {
    await options.model.completeDelivery(row.id, preparation.leasedAt, options.now());
    return "skipped" as const;
  }
  const context = preparation.context;
  if (!context) throw new Error("Messaging email delivery context is unavailable");
  const completedAt = options.now();
  if (kind === "EMAIL_MESSAGE") {
    if (context.messageSequence === null) throw new Error("Messaging email message is unavailable");
    if (context.lastReadSequence >= context.messageSequence || recentAlert(context, completedAt)) {
      await options.model.completeDelivery(row.id, preparation.leasedAt, completedAt);
      return "skipped" as const;
    }
  }
  const rendered = renderMessagingEmail(kind, {
    conversationId: row.conversationId,
    senderDisplayName: context.senderDisplayName,
    recipientRole: context.recipientRole,
    appPublicUrl: options.email.appPublicUrl,
    ...(context.decision ? { decision: context.decision } : {})
  });
  await options.email.client.send({
    sender: options.email.sender,
    to: [{ email: context.recipientEmail, ...(context.recipientDisplayName ? { name: context.recipientDisplayName } : {}) }],
    ...rendered
  });
  await options.model.completeEmailDelivery(row.id, preparation.leasedAt, options.now(), kind === "EMAIL_MESSAGE");
  return "sent" as const;
}

function recordDeliveryResult(
  telemetry: MessagingTelemetry,
  row: ClaimedMessagingDelivery,
  outcome: "published" | "sent" | "skipped" | "retried" | "terminal_failed",
  startedAt: number
) {
  telemetry.recordDelivery({
    deliveryId: row.id,
    conversationId: row.conversationId,
    deliveryKind: row.deliveryKind,
    outcome,
    durationMs: Math.round(performance.now() - startedAt),
    attempts: row.attempts
  });
}

function isRealtimeDelivery(kind: ClaimedMessagingDelivery["deliveryKind"]) {
  return kind === "REALTIME_MESSAGE" || kind === "REALTIME_CONVERSATION";
}

function parseEmailKind(kind: ClaimedMessagingDelivery["deliveryKind"]): MessagingEmailKind {
  if (kind === "EMAIL_REQUEST" || kind === "EMAIL_DECISION" || kind === "EMAIL_MESSAGE") return kind;
  throw new Error("Unknown messaging delivery kind");
}

function recentAlert(context: MessagingDeliveryEmailContext, now: Date) {
  return context.lastEmailAlertAt !== null && context.lastEmailAlertAt > new Date(now.getTime() - 15 * 60_000);
}

function sanitizeDeliveryError(error: unknown) {
  return error instanceof BrevoEmailError ? error.message.slice(0, 250) : "Messaging email delivery failed";
}

type Logger = { warn(message: string): void; error(message: string): void };
export type StartMessagingDeliveryDispatcherOptions = DispatcherConfig & {
  dispatch?: () => Promise<unknown>;
  logger?: Logger;
  pollIntervalMs?: number;
};

export function startMessagingDeliveryDispatcher(options: StartMessagingDeliveryDispatcherOptions): () => Promise<void> {
  const logger = options.logger ?? console;
  if (options.enabled === false) {
    logger.warn("Messaging delivery is disabled because messaging is disabled");
    return async () => undefined;
  }
  if (!options.apiKey || !options.sender || !options.appPublicUrl) {
    logger.warn("Messaging email delivery is disabled because Brevo configuration is incomplete");
  }
  const dispatch = options.dispatch ?? (() => dispatchMessagingDeliveryBatch(options));
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activePoll: Promise<void> | undefined;
  const poll = () => {
    if (stopped) return;
    timer = undefined;
    const currentPoll = (async () => {
      try {
        await dispatch();
      } catch {
        logger.error("Messaging delivery dispatch failed");
      } finally {
        if (!stopped) timer = setTimeout(poll, pollIntervalMs);
      }
    })();
    activePoll = currentPoll;
    void currentPoll.finally(() => {
      if (activePoll === currentPoll) activePoll = undefined;
    });
  };
  timer = setTimeout(poll, 0);
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await activePoll;
  };
}
