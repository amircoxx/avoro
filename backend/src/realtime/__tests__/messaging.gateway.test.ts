import { createServer, type Server } from "node:http";
import { EventEmitter } from "node:events";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/errors";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const telemetry = vi.hoisted(() => ({ recordSocket: vi.fn(), recordFanOut: vi.fn(), recordRateLimit: vi.fn() }));
vi.mock("../../services/session.service", () => ({ getCurrentUser: session.getCurrentUser }));
vi.mock("../../services/messaging-observability", () => ({ messagingTelemetry: telemetry }));

import { attachMessagingGateway, type MessagingEventSource } from "../messaging.gateway";
import type { MessagingBusEvent } from "../messaging-event-bus";

const origin = "http://localhost:3000";
const customer = { id: "customer-1", email: "customer@example.com", role: "CUSTOMER", fullName: "Customer", avatarUrl: null };
const tech = { id: "tech-1", email: "tech@example.com", role: "TECH", fullName: "Tech", avatarUrl: null };
const admin = { id: "admin-1", email: "admin@example.com", role: "ADMIN", fullName: "Admin", avatarUrl: null };
const conversationId = "8a01c8f3-22eb-443b-a3cc-6408dbd5a960";
const messageId = "3ad5ae32-1e87-4fe2-9b27-b56322ca9bee";
const clientRequestId = "d08d5fca-5ab3-4e47-bb26-a1aefee614a6";
const message = {
  id: messageId,
  sequence: "42",
  conversationId,
  senderUserId: customer.id,
  kind: "TEXT" as const,
  body: "hello",
  createdAt: "2026-08-15T12:00:00.000Z"
};
const conversation = {
  id: conversationId,
  status: "ACCEPTED" as const,
  counterpart: { userId: tech.id, displayName: "Tech", avatarUrl: null },
  requestedAt: "2026-08-14T12:00:00.000Z",
  acceptedAt: "2026-08-14T13:00:00.000Z",
  declinedAt: null,
  lastMessageAt: message.createdAt,
  lastMessage: message,
  unreadCount: 0,
  archivedAt: null,
  isBlocked: false,
  canManageBlock: true,
  stateVersion: "1"
};
const unread = { unreadMessages: 1, pendingRequests: 0, total: 1 };

function createEventSource() {
  const listeners = new Set<(event: MessagingBusEvent) => void | Promise<void>>();
  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    } satisfies MessagingEventSource,
    async publish(event: MessagingBusEvent) {
      await Promise.all([...listeners].map((listener) => listener(event)));
    }
  };
}

function createService() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message, conversation }),
    hydrateRealtimeEvent: vi.fn().mockResolvedValue({ message, conversation, unread })
  };
}

type Runtime = ReturnType<typeof attachMessagingGateway>;

describe("attachMessagingGateway", () => {
  let server: Server;
  let runtime: Runtime | undefined;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createServer((_request, response) => response.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    session.getCurrentUser.mockImplementation(async (cookie: string | undefined) => {
      if (cookie === "session=customer") return customer;
      if (cookie === "session=tech") return tech;
      if (cookie === "session=admin") return admin;
      return null;
    });
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.disconnect();
      client.io.engine?.close();
    }
    await runtime?.stop();
    runtime = undefined;
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  async function connect(cookie: string | undefined, requestOrigin = origin) {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      forceNew: true,
      autoConnect: false,
      reconnection: false,
      extraHeaders: {
        origin: requestOrigin,
        ...(cookie ? { cookie } : {})
      }
    });
    clients.push(client);
    client.connect();
    return client;
  }

  async function expectConnected(client: ClientSocket) {
    if (client.connected) return;
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
  }

  async function expectRejected(client: ClientSocket) {
    return new Promise<Error & { data?: { code?: string } }>((resolve) => client.once("connect_error", resolve));
  }

  it.each([
    [undefined, "session_invalid"],
    ["session=expired", "session_invalid"],
    ["session=admin", "forbidden"]
  ])("rejects an unauthorized handshake for %s", async (cookie, code) => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });

    const error = await expectRejected(await connect(cookie));

    expect(error.data?.code).toBe(code);
  });

  it("rejects an unapproved origin", async () => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });

    const error = await expectRejected(await connect("session=customer", "https://evil.example"));

    expect(error.data?.code).toBe("forbidden");
  });

  it("rejects connections when the server-owned feature flag is disabled", async () => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: false });

    const error = await expectRejected(await connect("session=customer"));

    expect(error.data?.code).toBe("messaging_disabled");
  });

  it("joins only the authenticated user's server-owned room", async () => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);

    const socket = runtime.io.sockets.sockets.get(client.id!);
    expect([...socket!.rooms]).toEqual(expect.arrayContaining([client.id, "user:customer-1"]));
    expect([...socket!.rooms].filter((room) => room.startsWith("user:"))).toEqual(["user:customer-1"]);

    client.emit("room:join", "user:tech-1");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect([...socket!.rooms]).not.toContain("user:tech-1");
  });

  it("allows normal multi-device use, rejects the sixth user socket, and restores capacity exactly once", async () => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });
    const allowed = await Promise.all(Array.from({ length: 5 }, () => connect("session=customer")));
    await Promise.all(allowed.map(expectConnected));

    const rejected = await connect("session=customer");
    const outcome = await new Promise<{ connected: boolean; error?: Error & { data?: { code?: string } } }>((resolve) => {
      rejected.once("connect", () => resolve({ connected: true }));
      rejected.once("connect_error", (error) => resolve({ connected: false, error }));
    });
    expect(outcome).toMatchObject({ connected: false, error: { data: { code: "connection_limit_reached" } } });

    allowed[0]!.disconnect();
    await vi.waitFor(() => expect(runtime!.io.sockets.sockets.size).toBe(4));
    const replacement = await connect("session=customer");
    await expectConnected(replacement);
    expect(runtime.io.sockets.sockets.size).toBe(5);
  });

  it("normalizes input, delegates to the service, and acknowledges only after persistence resolves", async () => {
    const eventBus = createEventSource();
    const service = createService();
    let resolvePersistence: ((value: { message: typeof message; conversation: typeof conversation }) => void) | undefined;
    service.sendMessage.mockImplementation(() => new Promise((resolve) => { resolvePersistence = resolve; }));
    runtime = attachMessagingGateway({ server, eventBus: eventBus.source, service, frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);

    const acknowledgment = client.emitWithAck("message:send", {
      conversationId,
      body: "  hello\r\n  ",
      clientRequestId
    });
    await vi.waitFor(() => expect(service.sendMessage).toHaveBeenCalledWith(
      { id: customer.id, role: "CUSTOMER" },
      { conversationId, body: "hello", clientRequestId }
    ));
    let settled = false;
    void acknowledgment.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolvePersistence?.({ message, conversation });
    await expect(acknowledgment).resolves.toEqual({ ok: true, message, conversation });
  });

  it("returns stable application and sanitized unknown error acknowledgments", async () => {
    const service = createService();
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service, frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);

    service.sendMessage.mockRejectedValueOnce(new AppError("Conversation is blocked", 403, "messaging_blocked"));
    await expect(client.emitWithAck("message:send", { conversationId, body: "hello", clientRequestId })).resolves.toEqual({
      ok: false,
      error: { code: "messaging_blocked", message: "Conversation is blocked" }
    });

    service.sendMessage.mockRejectedValueOnce(new Error("database password private-secret"));
    const failure = await client.emitWithAck("message:send", { conversationId, body: "hello", clientRequestId });
    expect(failure).toEqual({ ok: false, error: { code: "internal_error", message: "Message could not be sent" } });
    expect(JSON.stringify(failure)).not.toContain("private-secret");
  });

  it("hydrates committed identifiers for each target room without cross-user delivery", async () => {
    const eventBus = createEventSource();
    const service = createService();
    runtime = attachMessagingGateway({ server, eventBus: eventBus.source, service, frontendOrigin: origin, enabled: true });
    const customerOne = await connect("session=customer");
    const customerTwo = await connect("session=customer");
    const techClient = await connect("session=tech");
    await Promise.all([expectConnected(customerOne), expectConnected(customerTwo), expectConnected(techClient)]);
    const customerEvents = [vi.fn(), vi.fn()];
    const techEvent = vi.fn();
    customerOne.on("message:created", customerEvents[0]);
    customerTwo.on("message:created", customerEvents[1]);
    techClient.on("message:created", techEvent);

    await eventBus.publish({ eventKey: "message:customer", kind: "message", recipientUserId: customer.id, conversationId, messageId });
    await vi.waitFor(() => expect(customerEvents[0]).toHaveBeenCalledWith(message));
    expect(customerEvents[1]).toHaveBeenCalledWith(message);
    expect(techEvent).not.toHaveBeenCalled();

    await eventBus.publish({ eventKey: "message:tech", kind: "message", recipientUserId: tech.id, conversationId, messageId });
    await vi.waitFor(() => expect(techEvent).toHaveBeenCalledWith(message));
    expect(service.hydrateRealtimeEvent).toHaveBeenCalledWith(customer.id, { kind: "message", conversationId, messageId });
    expect(service.hydrateRealtimeEvent).toHaveBeenCalledWith(tech.id, { kind: "message", conversationId, messageId });
    expect(telemetry.recordFanOut).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: tech.id, conversationId, eventKind: "message", outcome: "published" }));
  });

  it("records identifier-only hydration failures for REST recovery", async () => {
    const eventBus = createEventSource();
    const service = createService();
    service.hydrateRealtimeEvent.mockRejectedValue(new Error("PRIVATE_MESSAGE_SENTINEL"));
    runtime = attachMessagingGateway({ server, eventBus: eventBus.source, service, frontendOrigin: origin, enabled: true });

    await eventBus.publish({ eventKey: "message:tech", kind: "message", recipientUserId: tech.id, conversationId, messageId });
    await vi.waitFor(() => expect(telemetry.recordFanOut).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: tech.id,
      conversationId,
      eventKind: "message",
      outcome: "failed"
    })));
    expect(JSON.stringify(telemetry.recordFanOut.mock.calls)).not.toContain("PRIVATE_MESSAGE_SENTINEL");

    service.hydrateRealtimeEvent.mockResolvedValueOnce(null);
    await eventBus.publish({ eventKey: "conversation:missing", kind: "conversation", recipientUserId: tech.id, conversationId });
    await vi.waitFor(() => expect(telemetry.recordFanOut).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: tech.id,
      conversationId,
      eventKind: "conversation",
      outcome: "failed"
    })));
  });

  it("enforces a 20-per-minute handshake limit by IP", async () => {
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const client = await connect("session=customer");
      await expectConnected(client);
      client.disconnect();
    }

    const error = await expectRejected(await connect("session=customer"));
    expect(error.data).toMatchObject({ code: "connection_rate_limited", retryAfterSeconds: 60 });
    expect(telemetry.recordRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "socket_handshake", retryAfterSeconds: 60 }));
  });

  it("enforces a per-user send-attempt limit across conversations", async () => {
    const service = createService();
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service, frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);

    for (let index = 0; index < 60; index += 1) {
      const nextConversationId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const ack = await client.emitWithAck("message:send", { conversationId: nextConversationId, body: "hello", clientRequestId });
      expect(ack.ok).toBe(true);
    }
    const userFailure = await client.emitWithAck("message:send", {
      conversationId: "00000000-0000-4000-8000-999999999999",
      body: "hello",
      clientRequestId
    });
    expect(userFailure).toMatchObject({ ok: false, error: { code: "message_rate_limited", retryAfterSeconds: 60 } });
    expect(service.sendMessage).toHaveBeenCalledTimes(60);
  });

  it("shares the 20-per-minute conversation limit across both participants", async () => {
    const service = createService();
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service, frontendOrigin: origin, enabled: true });
    const customerClient = await connect("session=customer");
    const techClient = await connect("session=tech");
    await Promise.all([expectConnected(customerClient), expectConnected(techClient)]);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const client = attempt % 2 === 0 ? customerClient : techClient;
      const ack = await client.emitWithAck("message:send", { conversationId, body: "hello", clientRequestId });
      expect(ack.ok).toBe(true);
    }

    await expect(techClient.emitWithAck("message:send", { conversationId, body: "hello", clientRequestId })).resolves.toMatchObject({
      ok: false,
      error: { code: "message_rate_limited", retryAfterSeconds: 60 }
    });
    expect(service.sendMessage).toHaveBeenCalledTimes(20);
  });

  it("rate-limits malformed command floods before another session lookup", async () => {
    const service = createService();
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service, frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ack = await client.emitWithAck("message:send", {});
      expect(ack).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
    const lookupCount = session.getCurrentUser.mock.calls.length;

    await expect(client.emitWithAck("message:send", {})).resolves.toMatchObject({
      ok: false,
      error: { code: "message_rate_limited", retryAfterSeconds: 60 }
    });
    expect(session.getCurrentUser).toHaveBeenCalledTimes(lookupCount);
    expect(service.sendMessage).not.toHaveBeenCalled();
  });

  it("waits for in-flight message commands and event hydration before stopping", async () => {
    const eventBus = createEventSource();
    const service = createService();
    let resolveSend: ((value: { message: typeof message; conversation: typeof conversation }) => void) | undefined;
    let resolveHydration: ((value: { message: typeof message; conversation: typeof conversation; unread: typeof unread }) => void) | undefined;
    service.sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
    service.hydrateRealtimeEvent.mockImplementation(() => new Promise((resolve) => { resolveHydration = resolve; }));
    runtime = attachMessagingGateway({ server, eventBus: eventBus.source, service, frontendOrigin: origin, enabled: true });
    const client = await connect("session=customer");
    await expectConnected(client);
    const acknowledge = vi.fn();

    client.emit("message:send", { conversationId, body: "hello", clientRequestId }, acknowledge);
    await vi.waitFor(() => expect(service.sendMessage).toHaveBeenCalledOnce());
    const publishing = eventBus.publish({ eventKey: "message:customer", kind: "message", recipientUserId: customer.id, conversationId, messageId });
    await vi.waitFor(() => expect(service.hydrateRealtimeEvent).toHaveBeenCalledOnce());

    const stopping = runtime.stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveSend?.({ message, conversation });
    await Promise.resolve();
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveHydration?.({ message, conversation, unread });
    await Promise.all([stopping, publishing]);
    expect(stopped).toBe(true);
  });

  it("waits for an in-flight handshake session lookup before stopping", async () => {
    let resolveLookup: ((value: typeof customer) => void) | undefined;
    session.getCurrentUser.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    runtime = attachMessagingGateway({ server, eventBus: createEventSource().source, service: createService(), frontendOrigin: origin, enabled: true });
    await connect("session=customer");
    await vi.waitFor(() => expect(session.getCurrentUser).toHaveBeenCalledOnce());

    const stopping = runtime.stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();

    expect(stopped).toBe(false);
    resolveLookup?.(customer);
    await stopping;
    expect(stopped).toBe(true);
  });

  it("serializes periodic session lookups and drains one without rearming after stop", async () => {
    let resolvePeriodic: ((value: typeof customer) => void) | undefined;
    session.getCurrentUser
      .mockResolvedValueOnce(customer)
      .mockImplementation(() => new Promise((resolve) => { resolvePeriodic = resolve; }));
    runtime = attachMessagingGateway({
      server,
      eventBus: createEventSource().source,
      service: createService(),
      frontendOrigin: origin,
      enabled: true,
      sessionRevalidationMs: 10
    });
    const client = await connect("session=customer");
    await expectConnected(client);
    await vi.waitFor(() => expect(session.getCurrentUser).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 35));

    expect(session.getCurrentUser).toHaveBeenCalledTimes(2);
    const stopping = runtime.stop();
    let stopped = false;
    void stopping.then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolvePeriodic?.(customer);
    await stopping;
    const settledLookupCount = session.getCurrentUser.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(session.getCurrentUser).toHaveBeenCalledTimes(settledLookupCount);
  });

  it("emits session:invalid and disconnects when periodic revalidation fails", async () => {
    runtime = attachMessagingGateway({
      server,
      eventBus: createEventSource().source,
      service: createService(),
      frontendOrigin: origin,
      enabled: true,
      sessionRevalidationMs: 20
    });
    const client = await connect("session=customer");
    await expectConnected(client);
    session.getCurrentUser.mockResolvedValue(null);

    const invalid = new Promise<void>((resolve) => client.once("session:invalid", resolve));
    await invalid;
    await vi.waitFor(() => expect(client.connected).toBe(false));
  });
});
