import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchMessagingDeliveryBatch,
  startMessagingDeliveryDispatcher
} from "../messaging-delivery-dispatcher";
import { BrevoEmailError } from "../../email/brevo.client";

const now = new Date("2026-08-15T12:00:00.000Z");
const config = {
  apiKey: "api-key",
  sender: { email: "messages@example.com", name: "Find My Tech" },
  appPublicUrl: "https://avoro.example"
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    deliveryKind: "EMAIL_MESSAGE",
    conversationId: "conversation-1",
    messageId: "message-1",
    recipientUserId: "tech-1",
    payload: { conversationId: "conversation-1", messageId: "message-1" },
    attempts: 1,
    leasedAt: now,
    ...overrides
  };
}

function emailContext(overrides: Record<string, unknown> = {}) {
  return {
    recipientEmail: "maya@example.com",
    recipientDisplayName: "Maya",
    recipientRole: "TECH",
    senderDisplayName: "Avery",
    messageSequence: 42n,
    lastReadSequence: 0n,
    lastEmailAlertAt: null,
    decision: undefined,
    ...overrides
  };
}

function model(rows = [row()]) {
  return {
    claimDeliveryBatch: vi.fn().mockResolvedValue(rows),
    publishRealtimeDelivery: vi.fn().mockResolvedValue(undefined),
    loadDeliveryEmailContext: vi.fn().mockResolvedValue(emailContext()),
    prepareEmailDelivery: vi.fn().mockResolvedValue({ context: emailContext(), leasedAt: now }),
    completeDelivery: vi.fn().mockResolvedValue(undefined),
    completeEmailDelivery: vi.fn().mockResolvedValue(undefined),
    retryDelivery: vi.fn().mockResolvedValue(undefined),
    getDeliveryHealth: vi.fn().mockResolvedValue({ pendingDepth: rows.length, oldestAgeMs: rows.length ? 1_000 : null, attempts: rows[0]?.attempts ?? 0 })
  };
}

describe("dispatchMessagingDeliveryBatch", () => {
  it("uses the leased model claim with its 50-row, SKIP LOCKED, 60-second, eight-attempt policy", async () => {
    const source = readFileSync(new URL("../../../models/messaging.model.ts", import.meta.url), "utf8");
    const claim = source.slice(source.indexOf("async function claimDeliveryBatch"), source.indexOf("function completeDelivery"));
    const deliveryModel = model([]);

    await expect(dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send: vi.fn() }, ...config, now: () => now })).resolves.toBe(0);

    expect(deliveryModel.claimDeliveryBatch).toHaveBeenCalledWith(now, { includeEmail: true });
    expect(claim).toContain("FOR UPDATE SKIP LOCKED");
    expect(claim).toContain("LIMIT 50");
    expect(claim).toContain('"attempts" < 8');
    expect(claim).toContain("MESSAGING_DELIVERY_LEASE_MS");
    expect(source).toContain("const MESSAGING_DELIVERY_LEASE_MS = 60_000");
  });

  it("records body-free queue and delivery-result health", async () => {
    const deliveryModel = model([row()]);
    const telemetry = { recordDelivery: vi.fn(), recordDeliveryHealth: vi.fn() };

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send: vi.fn().mockResolvedValue({}) }, telemetry: telemetry as never, ...config, now: () => now });

    expect(telemetry.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-1", outcome: "sent", attempts: 1 }));
    expect(telemetry.recordDeliveryHealth).toHaveBeenCalledWith({ pendingDepth: 1, oldestAgeMs: 1_000, attempts: 1 });
    expect(JSON.stringify(telemetry)).not.toMatch(/body|cookie|email|payload/i);
  });

  it("publishes both realtime fan-out rows using identifier-only data", async () => {
    const deliveries = [
      row({ id: "delivery-sender", deliveryKind: "REALTIME_MESSAGE", recipientUserId: "customer-1" }),
      row({ id: "delivery-recipient", deliveryKind: "REALTIME_MESSAGE", recipientUserId: "tech-1" })
    ];
    const deliveryModel = model(deliveries);

    await expect(dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send: vi.fn() }, ...config, now: () => now })).resolves.toBe(2);

    expect(deliveryModel.publishRealtimeDelivery).toHaveBeenCalledTimes(2);
    expect(deliveryModel.publishRealtimeDelivery).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKind: "REALTIME_MESSAGE", conversationId: "conversation-1", messageId: "message-1", recipientUserId: "customer-1"
    }), now);
    expect(JSON.stringify(deliveryModel.publishRealtimeDelivery.mock.calls)).not.toContain("body");
  });

  it("publishes realtime rows while incomplete Brevo configuration leaves email rows unclaimed", async () => {
    const delivery = row({ deliveryKind: "REALTIME_MESSAGE", recipientUserId: "tech-1" });
    const deliveryModel = model([delivery]);

    await expect(dispatchMessagingDeliveryBatch({
      enabled: true,
      model: deliveryModel,
      now: () => now
    })).resolves.toBe(1);

    expect(deliveryModel.claimDeliveryBatch).toHaveBeenCalledWith(now, { includeEmail: false });
    expect(deliveryModel.publishRealtimeDelivery).toHaveBeenCalledWith(delivery, now);
    expect(deliveryModel.prepareEmailDelivery).not.toHaveBeenCalled();
  });

  it("does not send a message alert before its two-minute eligible claim", async () => {
    const deliveryModel = model([]);
    const send = vi.fn();

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, ...config, now: () => now });

    expect(send).not.toHaveBeenCalled();
    expect(deliveryModel.claimDeliveryBatch).toHaveBeenCalledWith(now, { includeEmail: true });
  });

  it("marks a message-email row complete without sending when the message was already read", async () => {
    const delivery = row();
    const deliveryModel = model([delivery]);
    deliveryModel.prepareEmailDelivery.mockResolvedValue({ context: emailContext({ lastReadSequence: 42n }), leasedAt: now });
    const send = vi.fn();

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, ...config, now: () => now });

    expect(send).not.toHaveBeenCalled();
    expect(deliveryModel.completeDelivery).toHaveBeenCalledWith(delivery.id, delivery.leasedAt, now);
  });

  it("never invokes Brevo when a stale worker loses its lease before email preparation", async () => {
    const delivery = row();
    const deliveryModel = model([delivery]);
    deliveryModel.prepareEmailDelivery.mockResolvedValue(null);
    const send = vi.fn();
    const telemetry = { recordDelivery: vi.fn(), recordDeliveryHealth: vi.fn() };

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, telemetry: telemetry as never, ...config, now: () => now });

    expect(deliveryModel.prepareEmailDelivery).toHaveBeenCalledWith(delivery.id, delivery.leasedAt, now);
    expect(send).not.toHaveBeenCalled();
    expect(deliveryModel.completeEmailDelivery).not.toHaveBeenCalled();
    expect(deliveryModel.retryDelivery).not.toHaveBeenCalled();
    expect(telemetry.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: delivery.id, outcome: "skipped" }));
  });

  it("coalesces unread message alerts within fifteen minutes", async () => {
    const delivery = row();
    const deliveryModel = model([delivery]);
    deliveryModel.prepareEmailDelivery.mockResolvedValue({
      context: emailContext({ lastEmailAlertAt: new Date("2026-08-15T11:45:01.000Z") }),
      leasedAt: now
    });
    const send = vi.fn();

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, ...config, now: () => now });

    expect(send).not.toHaveBeenCalled();
    expect(deliveryModel.completeDelivery).toHaveBeenCalledWith(delivery.id, delivery.leasedAt, now);
  });

  it("sends at most one same-conversation alert when one batch races eligible rows", async () => {
    const first = row({ id: "delivery-1", messageId: "message-1" });
    const second = row({ id: "delivery-2", messageId: "message-2" });
    const deliveryModel = model([first, second]);
    deliveryModel.prepareEmailDelivery.mockImplementation(async (id: string) => id === first.id
      ? { context: emailContext(), leasedAt: now, send: true }
      : { context: emailContext({ messageSequence: 43n }), leasedAt: now, send: false });
    const send = vi.fn().mockResolvedValue({ messageId: "brevo-message-1" });

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, ...config, now: () => now });

    expect(send).toHaveBeenCalledTimes(1);
    expect(deliveryModel.completeDelivery).toHaveBeenCalledWith(second.id, now, now);
    expect(deliveryModel.completeEmailDelivery).toHaveBeenCalledWith(first.id, now, now, true);
  });

  it("sends a body-free alert and atomically records its participant coalescing timestamp", async () => {
    const delivery = row();
    const deliveryModel = model([delivery]);
    const renewedLease = new Date("2026-08-15T12:00:30.000Z");
    deliveryModel.prepareEmailDelivery.mockResolvedValue({ context: emailContext(), leasedAt: renewedLease });
    const send = vi.fn().mockResolvedValue({ messageId: "brevo-message-1" });

    await expect(dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send }, ...config, now: () => now })).resolves.toBe(1);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      sender: config.sender,
      to: [{ email: "maya@example.com", name: "Maya" }],
      subject: "New message from Avery"
    }));
    expect(JSON.stringify(send.mock.calls)).not.toContain("body");
    expect(deliveryModel.completeEmailDelivery).toHaveBeenCalledWith(delivery.id, renewedLease, now, true);
  });

  it.each([
    [undefined, "network"],
    [408, "status 408"],
    [429, "status 429"],
    [500, "status 500"]
  ])("retries retryable Brevo failure %s with bounded exponential backoff", async (status, label) => {
    const delivery = row({ attempts: 3 });
    const deliveryModel = model([delivery]);
    const renewedLease = new Date("2026-08-15T12:00:30.000Z");
    deliveryModel.prepareEmailDelivery.mockResolvedValue({ context: emailContext(), leasedAt: renewedLease });
    const error = new BrevoEmailError(`Brevo email request failed ${label}`, status, true);

    await dispatchMessagingDeliveryBatch({ model: deliveryModel, client: { send: vi.fn().mockRejectedValue(error) }, ...config, now: () => now });

    expect(deliveryModel.retryDelivery).toHaveBeenCalledWith(
      delivery.id,
      renewedLease,
      new Date("2026-08-15T12:08:00.000Z"),
      expect.stringContaining(label)
    );
  });

  it("terminalizes unknown errors and an eighth failure without persisting private diagnostics", async () => {
    const delivery = row({ attempts: 8 });
    const deliveryModel = model([delivery]);

    await dispatchMessagingDeliveryBatch({
      model: deliveryModel,
      client: { send: vi.fn().mockRejectedValue(new Error("private provider diagnostics and api-key")) },
      ...config,
      now: () => now
    });

    const retry = deliveryModel.retryDelivery.mock.calls[0];
    expect(retry).toEqual([delivery.id, delivery.leasedAt, null, "Messaging email delivery failed"]);
    expect(JSON.stringify(retry)).not.toContain("private provider diagnostics");
    expect(JSON.stringify(retry)).not.toContain("api-key");
  });
});

describe("startMessagingDeliveryDispatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not poll when the server-owned messaging feature flag is disabled", async () => {
    const dispatch = vi.fn();
    const warn = vi.fn();
    const stop = startMessagingDeliveryDispatcher({ enabled: false, dispatch, logger: { warn, error: vi.fn() }, ...config });

    await vi.advanceTimersByTimeAsync(1_000);
    await stop();

    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("continues polling realtime delivery when Brevo configuration is incomplete", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();
    const stop = startMessagingDeliveryDispatcher({ enabled: true, dispatch, logger: { warn, error: vi.fn() } });

    await vi.advanceTimersByTimeAsync(0);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Messaging email delivery is disabled because Brevo configuration is incomplete");
    await stop();
  });

  it("waits for an in-flight dispatch to settle without rescheduling it", async () => {
    let resolveDispatch: (() => void) | undefined;
    const dispatch = vi.fn(() => new Promise<void>((resolve) => { resolveDispatch = resolve; }));
    const stop = startMessagingDeliveryDispatcher({ dispatch, logger: { warn: vi.fn(), error: vi.fn() }, pollIntervalMs: 1_000, ...config });

    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const stopping = Promise.resolve(stop());
    let settled = false;
    void stopping.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveDispatch?.();
    await stopping;

    expect(vi.getTimerCount()).toBe(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
