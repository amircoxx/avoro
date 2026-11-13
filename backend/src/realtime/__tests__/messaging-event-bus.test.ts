import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startMessagingEventBus } from "../messaging-event-bus";

class FakeClient extends EventEmitter {
  connect = vi.fn().mockResolvedValue(undefined);
  query = vi.fn().mockResolvedValue({});
  end = vi.fn().mockResolvedValue(undefined);
}

describe("startMessagingEventBus", () => {
  afterEach(() => vi.useRealTimers());

  it("uses a dedicated client and listens for identifier-only messaging events", async () => {
    const client = new FakeClient();
    const onEvent = vi.fn();
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent,
      clientFactory: (connectionString) => {
        expect(connectionString).toBe("postgresql://listener.example/messages");
        return client;
      }
    });

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith("LISTEN messaging_events");

    client.emit("notification", {
      channel: "messaging_events",
      payload: JSON.stringify({
        eventKey: "message-1:message:realtime:user-2",
        kind: "message",
        recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
        conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
        messageId: "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee"
      })
    });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({
      eventKey: "message-1:message:realtime:user-2",
      kind: "message",
      recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
      conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
      messageId: "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee"
    }));

    await stop();
  });

  it("rejects malformed and private payloads without logging their contents", async () => {
    const client = new FakeClient();
    const onEvent = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent,
      clientFactory: () => client,
      logger
    });

    client.emit("notification", { channel: "messaging_events", payload: "not-json-cookie-secret" });
    client.emit("notification", {
      channel: "messaging_events",
      payload: JSON.stringify({
        eventKey: "event-1",
        kind: "message",
        recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
        conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960",
        messageId: "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee",
        body: "private body"
      })
    });

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(2));
    expect(onEvent).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("cookie-secret");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private body");

    await stop();
  });

  it("records an identifier-free listener failure when an event handler rejects", async () => {
    const client = new FakeClient();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const telemetry = { recordListener: vi.fn() };
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent: vi.fn().mockRejectedValue(new Error("PRIVATE_HANDLER_SENTINEL")),
      clientFactory: () => client,
      logger,
      telemetry
    });

    client.emit("notification", {
      channel: "messaging_events",
      payload: JSON.stringify({
        eventKey: "event-1",
        kind: "conversation",
        recipientUserId: "46fb281f-818c-4145-9c08-76728155d64b",
        conversationId: "8a01c8f3-22eb-443b-a3cc-6408dbd5a960"
      })
    });

    await vi.waitFor(() => expect(telemetry.recordListener).toHaveBeenCalledWith({ outcome: "failed" }));
    expect(JSON.stringify([logger.error.mock.calls, telemetry.recordListener.mock.calls])).not.toContain("PRIVATE_HANDLER_SENTINEL");
    await stop();
  });

  it("reports a lost connection, reconnects, and stops the current listener cleanly", async () => {
    vi.useFakeTimers();
    const first = new FakeClient();
    const second = new FakeClient();
    const clients = [first, second];
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const telemetry = { recordListener: vi.fn() };
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent: vi.fn(),
      clientFactory: () => clients.shift()!,
      logger,
      telemetry: telemetry as never,
      reconnectDelayMs: 25
    });

    first.emit("error", new Error("password=database-secret"));
    await vi.advanceTimersByTimeAsync(25);

    expect(logger.error).toHaveBeenCalledWith("Messaging event bus connection lost");
    expect(JSON.stringify([logger.error.mock.calls, logger.info.mock.calls])).not.toContain("database-secret");
    expect(first.end).toHaveBeenCalledOnce();
    expect(second.connect).toHaveBeenCalledOnce();
    expect(second.query).toHaveBeenCalledWith("LISTEN messaging_events");
    expect(logger.info).toHaveBeenCalledWith("Messaging event bus reconnected");
    expect(telemetry.recordListener).toHaveBeenCalledWith({ outcome: "disconnected" });
    expect(telemetry.recordListener).toHaveBeenCalledWith({ outcome: "reconnected" });

    await stop();

    expect(second.query).toHaveBeenCalledWith("UNLISTEN messaging_events");
    expect(second.end).toHaveBeenCalledOnce();
  });

  it("drains a reconnect without listening or rearming after stop", async () => {
    vi.useFakeTimers();
    const first = new FakeClient();
    const second = new FakeClient();
    let resolveSecondConnect: (() => void) | undefined;
    second.connect.mockImplementation(() => new Promise<void>((resolve) => { resolveSecondConnect = resolve; }));
    const clients = [first, second];
    const clientFactory = vi.fn(() => clients.shift()!);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent: vi.fn(),
      clientFactory,
      logger,
      reconnectDelayMs: 25
    });

    first.emit("error", new Error("connection lost"));
    await vi.advanceTimersByTimeAsync(25);
    expect(second.connect).toHaveBeenCalledOnce();

    const stopping = stop();
    expect(stop()).toBe(stopping);
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();
    const wasPendingBeforeConnectSettled = !stopped;

    resolveSecondConnect?.();
    await stopping;
    await vi.advanceTimersByTimeAsync(100);

    expect(wasPendingBeforeConnectSettled).toBe(true);
    expect(second.query).not.toHaveBeenCalledWith("LISTEN messaging_events");
    expect(second.end).toHaveBeenCalledOnce();
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for a lost client to finish closing before stop resolves", async () => {
    vi.useFakeTimers();
    const first = new FakeClient();
    let resolveLostClientEnd: (() => void) | undefined;
    first.end.mockImplementation(() => new Promise<void>((resolve) => { resolveLostClientEnd = resolve; }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const stop = await startMessagingEventBus({
      connectionString: "postgresql://listener.example/messages",
      onEvent: vi.fn(),
      clientFactory: () => first,
      logger,
      reconnectDelayMs: 25
    });

    first.emit("error", new Error("connection lost"));
    await vi.waitFor(() => expect(first.end).toHaveBeenCalledOnce());
    const stopping = stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();
    const wasPendingBeforeCloseSettled = !stopped;

    resolveLostClientEnd?.();
    await stopping;
    await vi.runAllTimersAsync();

    expect(wasPendingBeforeCloseSettled).toBe(true);
    expect(first.end).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
