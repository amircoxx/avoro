/** Claims durable notification rows briefly, then performs provider I/O outside the transaction. */
import { Prisma } from "@prisma/client";
import { prisma } from "../../models/database.model";
import { BrevoEmailClient, BrevoEmailError, type EmailClient } from "./brevo.client";
import { renderBookingEmail, type BookingEmailKind, type BookingEmailPayload } from "./booking-email";

export type ClaimedOutboxRow = {
  id: string;
  messageKind: string;
  recipientEmail: string;
  recipientName: string | null;
  payload: unknown;
  attempts: number;
  leasedAt: Date;
};

type OutboxTransaction = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

export type OutboxDatabase = {
  $transaction<T>(callback: (transaction: OutboxTransaction) => Promise<T>): Promise<T>;
  notificationOutbox: {
    updateMany(args: {
      where: { id: string; leasedAt: Date; sentAt: null };
      data: {
        sentAt?: Date;
        leasedAt: null;
        nextAttemptAt: Date | null;
        brevoMessageId?: string;
        lastError: string | null;
      };
    }): Promise<{ count: number }>;
  };
};

type DispatcherConfig = {
  apiKey?: string;
  sender?: { email: string; name: string };
  appPublicUrl?: string;
};

export type DispatchOutboxOptions = DispatcherConfig & {
  database?: OutboxDatabase;
  client?: EmailClient;
  now?: () => Date;
};

export async function dispatchOutboxBatch(options: DispatchOutboxOptions): Promise<number> {
  if (!options.apiKey || !options.sender || !options.appPublicUrl) return 0;
  const sender = options.sender;
  const appPublicUrl = options.appPublicUrl;
  const database = options.database ?? prisma as unknown as OutboxDatabase;
  const client = options.client ?? new BrevoEmailClient(options.apiKey);
  const currentTime = options.now?.() ?? new Date();
  const leaseExpiredBefore = new Date(currentTime.getTime() - 60_000);
  const claimed = await database.$transaction((transaction) => transaction.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
    WITH due AS (
      SELECT "id"
      FROM "NotificationOutbox"
      WHERE "sentAt" IS NULL
        AND "nextAttemptAt" IS NOT NULL
        AND "attempts" < 8
        AND "nextAttemptAt" <= ${currentTime}
        AND ("leasedAt" IS NULL OR "leasedAt" <= ${leaseExpiredBefore})
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "NotificationOutbox" AS outbox
    SET "leasedAt" = ${currentTime},
        "attempts" = outbox."attempts" + 1,
        "updatedAt" = ${currentTime}
    FROM due
    WHERE outbox."id" = due."id"
    RETURNING outbox."id", outbox."messageKind", outbox."recipientEmail",
      outbox."recipientName", outbox."payload", outbox."attempts", outbox."leasedAt"
  `));

  const deliveries = await Promise.allSettled(claimed.map(async (item) => {
    let messageId: string;
    try {
      const payload = parsePayload(item.payload, appPublicUrl);
      const rendered = renderBookingEmail(parseMessageKind(item.messageKind), payload);
      const result = await client.send({
        sender,
        to: [{ email: item.recipientEmail, ...(item.recipientName ? { name: item.recipientName } : {}) }],
        ...rendered
      });
      messageId = result.messageId;
    } catch (error) {
      const failedAt = options.now?.() ?? new Date();
      const retryable = error instanceof BrevoEmailError && error.retryable;
      const terminal = item.attempts >= 8 || !retryable;
      await database.notificationOutbox.updateMany({
        where: { id: item.id, leasedAt: item.leasedAt, sentAt: null },
        data: {
          leasedAt: null,
          nextAttemptAt: terminal
            ? null
            : new Date(failedAt.getTime() + Math.min(2 ** item.attempts, 60) * 60_000),
          lastError: sanitizeDeliveryError(error)
        }
      });
      return;
    }
    await database.notificationOutbox.updateMany({
      where: { id: item.id, leasedAt: item.leasedAt, sentAt: null },
      data: {
        sentAt: options.now?.() ?? new Date(),
        leasedAt: null,
        nextAttemptAt: null,
        brevoMessageId: messageId,
        lastError: null
      }
    });
  }));
  const persistenceFailure = deliveries.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (persistenceFailure) throw persistenceFailure.reason;
  return claimed.length;
}

type Logger = { warn(message: string): void; error(message: string): void };
export type StartOutboxDispatcherOptions = DispatcherConfig & {
  dispatch?: () => Promise<unknown>;
  logger?: Logger;
  pollIntervalMs?: number;
};

export function startOutboxDispatcher(options: StartOutboxDispatcherOptions): () => void {
  const logger = options.logger ?? console;
  if (!options.apiKey || !options.sender || !options.appPublicUrl) {
    logger.warn("Booking email delivery is disabled because Brevo configuration is incomplete");
    return () => undefined;
  }

  const dispatch = options.dispatch ?? (() => dispatchOutboxBatch(options));
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const poll = async () => {
    if (stopped) return;
    try {
      await dispatch();
    } catch {
      logger.error("Booking email outbox dispatch failed");
    } finally {
      if (!stopped) timer = setTimeout(poll, pollIntervalMs);
    }
  };

  timer = setTimeout(poll, 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

function parsePayload(value: unknown, appPublicUrl: string): BookingEmailPayload {
  if (!isRecord(value)) throw new Error("Invalid booking email payload");
  const requiredStrings = ["bookingId", "customerName", "techName", "serviceName", "startAt", "endAt", "timeZone", "recipientRole"] as const;
  const requiredNumbers = ["durationMinutes", "startingPriceCents", "cancellationCutoffMinutes"] as const;
  for (const key of requiredStrings) if (typeof value[key] !== "string") throw new Error("Invalid booking email payload");
  for (const key of requiredNumbers) if (typeof value[key] !== "number") throw new Error("Invalid booking email payload");
  if (value.recipientRole !== "CUSTOMER" && value.recipientRole !== "TECH") throw new Error("Invalid booking email payload");
  return {
    bookingId: value.bookingId as string,
    customerName: value.customerName as string,
    techName: value.techName as string,
    serviceName: value.serviceName as string,
    startAt: value.startAt as string,
    endAt: value.endAt as string,
    timeZone: value.timeZone as string,
    durationMinutes: value.durationMinutes as number,
    startingPriceCents: value.startingPriceCents as number,
    cancellationCutoffMinutes: value.cancellationCutoffMinutes as number,
    recipientRole: value.recipientRole,
    appPublicUrl,
    ...(typeof value.canceledAt === "string" ? { canceledAt: value.canceledAt } : {}),
    ...(typeof value.oldStartAt === "string" ? { oldStartAt: value.oldStartAt } : {}),
    ...(typeof value.oldEndAt === "string" ? { oldEndAt: value.oldEndAt } : {})
  };
}

function parseMessageKind(value: string): BookingEmailKind {
  if (value === "BOOKING_CONFIRMED" || value === "BOOKING_CANCELED" || value === "BOOKING_RESCHEDULED") return value;
  throw new Error("Invalid booking email message kind");
}

function sanitizeDeliveryError(error: unknown) {
  if (error instanceof BrevoEmailError) return error.message.slice(0, 250);
  return "Email delivery failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
