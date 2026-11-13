import { describe, expect, it, vi } from "vitest";
import { createMessagingTelemetry } from "../messaging-observability";

describe("messaging telemetry", () => {
  it("stays quiet during repeated empty queue polls", () => {
    const info = vi.fn();
    const telemetry = createMessagingTelemetry({ info });
    telemetry.recordDeliveryHealth({ pendingDepth: 0, oldestAgeMs: null, attempts: 0 });
    telemetry.recordDeliveryHealth({ pendingDepth: 0, oldestAgeMs: null, attempts: 0 });
    expect(info).not.toHaveBeenCalled();
  });

  it("logs queue changes and recovery without repeating aging-only updates", () => {
    const info = vi.fn();
    const telemetry = createMessagingTelemetry({ info });
    telemetry.recordDeliveryHealth({ pendingDepth: 2, oldestAgeMs: 1000, attempts: 1 });
    telemetry.recordDeliveryHealth({ pendingDepth: 2, oldestAgeMs: 6000, attempts: 1 });
    telemetry.recordDeliveryHealth({ pendingDepth: 2, oldestAgeMs: 11000, attempts: 2 });
    telemetry.recordDeliveryHealth({ pendingDepth: 1, oldestAgeMs: 16000, attempts: 2 });
    telemetry.recordDeliveryHealth({ pendingDepth: 0, oldestAgeMs: null, attempts: 0 });
    telemetry.recordDeliveryHealth({ pendingDepth: 0, oldestAgeMs: null, attempts: 0 });
    expect(info.mock.calls).toEqual([
      ["messaging.delivery.health", { pendingDepth: 2, oldestAgeMs: 1000, attempts: 1 }],
      ["messaging.delivery.health", { pendingDepth: 2, oldestAgeMs: 11000, attempts: 2 }],
      ["messaging.delivery.health", { pendingDepth: 1, oldestAgeMs: 16000, attempts: 2 }],
      ["messaging.delivery.health", { pendingDepth: 0, oldestAgeMs: null, attempts: 0 }]
    ]);
  });

  it("records message-write identifiers and outcome without accepting sensitive inputs", () => {
    const info = vi.fn();
    const telemetry = createMessagingTelemetry({ info });

    telemetry.recordWrite({
      actorUserId: "customer-1",
      conversationId: "conversation-1",
      outcome: "created",
      durationMs: 17
    });

    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain("customer-1");
    expect(serialized).toContain("conversation-1");
    expect(serialized).toContain("created");
    expect(serialized).toContain("17");
    expect(serialized).not.toContain("body");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("payload");
  });

  it("records delivery health and socket outcomes through typed methods", () => {
    const info = vi.fn();
    const telemetry = createMessagingTelemetry({ info });

    telemetry.recordDeliveryHealth({ pendingDepth: 3, oldestAgeMs: 900, attempts: 2 });
    telemetry.recordSocket({ actorUserId: "tech-1", outcome: "connected", durationMs: 4 });
    telemetry.recordSocket({ actorUserId: "tech-1", outcome: "reconnected", durationMs: 9 });

    expect(info).toHaveBeenCalledWith("messaging.delivery.health", { pendingDepth: 3, oldestAgeMs: 900, attempts: 2 });
    expect(info).toHaveBeenCalledWith("messaging.socket", { actorUserId: "tech-1", outcome: "connected", durationMs: 4 });
    expect(info).toHaveBeenCalledWith("messaging.socket", { actorUserId: "tech-1", outcome: "reconnected", durationMs: 9 });
  });

  it("records catch-up, delivery, fan-out, listener, and limiter events with body-free fields", () => {
    const info = vi.fn();
    const telemetry = createMessagingTelemetry({ info });

    telemetry.recordCatchUp({ actorUserId: "customer-1", outcome: "completed", durationMs: 5, messageCount: 2 });
    telemetry.recordDelivery({ deliveryId: "delivery-1", conversationId: "conversation-1", deliveryKind: "EMAIL_MESSAGE", outcome: "sent", durationMs: 8, attempts: 1 });
    telemetry.recordFanOut({ recipientUserId: "tech-1", conversationId: "conversation-1", eventKind: "message", outcome: "failed", durationMs: 3 });
    telemetry.recordListener({ outcome: "reconnected" });
    telemetry.recordRateLimit({ scope: "http_history", actorUserId: "customer-1", retryAfterSeconds: 60 });

    expect(info).toHaveBeenCalledWith("messaging.catch_up", expect.objectContaining({ messageCount: 2 }));
    expect(info).toHaveBeenCalledWith("messaging.delivery.result", expect.objectContaining({ deliveryId: "delivery-1", outcome: "sent" }));
    expect(info).toHaveBeenCalledWith("messaging.fan_out", expect.objectContaining({ recipientUserId: "tech-1", outcome: "failed" }));
    expect(info).toHaveBeenCalledWith("messaging.listener", { outcome: "reconnected" });
    expect(info).toHaveBeenCalledWith("messaging.rate_limit", expect.objectContaining({ scope: "http_history" }));
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/"(?:body|cookie|email|payload)"/i);
  });
});
