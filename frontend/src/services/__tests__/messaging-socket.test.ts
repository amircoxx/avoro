import { describe, expect, it, vi } from "vitest";
import { createMessagingSocket, MessagingSocketError, type SocketIoFactory } from "../messaging-socket";

const message = {
  id: "message-42",
  sequence: "42",
  conversationId: "conversation-1",
  senderUserId: "customer-1",
  kind: "TEXT" as const,
  body: "Hello",
  createdAt: "2026-08-14T12:00:00.000Z"
};

const conversation = {
  id: "conversation-1",
  status: "ACCEPTED" as const,
  counterpart: { userId: "tech-1", displayName: "Jordan", avatarUrl: null },
  requestedAt: "2026-08-14T11:00:00.000Z",
  acceptedAt: "2026-08-14T11:01:00.000Z",
  declinedAt: null,
  lastMessageAt: "2026-08-14T12:00:00.000Z",
  lastMessage: message,
  unreadCount: 1,
  archivedAt: null,
  isBlocked: false,
  canManageBlock: true,
  stateVersion: "1"
};

function socketDouble() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const socket = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, listener: (...args: any[]) => void) => {
      const current = listeners.get(event) ?? new Set();
      current.add(listener);
      listeners.set(event, current);
      return socket;
    }),
    off: vi.fn((event: string, listener: (...args: any[]) => void) => {
      listeners.get(event)?.delete(listener);
      return socket;
    }),
    timeout: vi.fn(() => ({ emit: socket.emit })),
    emit: vi.fn(),
    io: { reconnection: vi.fn() },
    trigger(event: string, ...args: any[]) { for (const listener of listeners.get(event) ?? []) listener(...args); }
  };
  return socket;
}

describe("messaging socket client", () => {
  it("reconnects after a server shutdown but stays disconnected after logout or session invalidation", () => {
    const socket = socketDouble();
    const client = createMessagingSocket({ ioFactory: vi.fn(() => socket) as unknown as SocketIoFactory });
    client.onConnection(() => undefined);
    client.connect();
    socket.trigger("disconnect", "io server disconnect");
    expect(socket.connect).toHaveBeenCalledTimes(2);

    client.disconnect();
    socket.trigger("disconnect", "io server disconnect");
    expect(socket.connect).toHaveBeenCalledTimes(2);

    client.connect();
    socket.trigger("session:invalid");
    socket.trigger("disconnect", "io server disconnect");
    expect(socket.connect).toHaveBeenCalledTimes(3);
  });

  it("connects directly over WebSocket with cookie credentials and maps a successful five-second acknowledgement", async () => {
    const socket = socketDouble();
    const ioFactory = vi.fn(() => socket) as unknown as SocketIoFactory;
    const client = createMessagingSocket({ ioFactory, origin: "https://api.example.test" });

    client.connect();
    expect(ioFactory).toHaveBeenCalledWith("https://api.example.test", {
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true
    });
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.emit).not.toHaveBeenCalledWith("join", expect.anything());

    socket.emit.mockImplementationOnce((_event: string, _input: unknown, callback: (error: Error | null, result: unknown) => void) => {
      callback(null, { ok: true, message, conversation });
    });
    await expect(client.sendMessage({ conversationId: "conversation-1", body: "Hello", clientRequestId: "request-1" }))
      .resolves.toEqual({ message, conversation });
    expect(socket.timeout).toHaveBeenCalledWith(5_000);
    expect(socket.emit).toHaveBeenCalledWith("message:send", { conversationId: "conversation-1", body: "Hello", clientRequestId: "request-1" }, expect.any(Function));
  });

  it("returns stable errors for timed out and rejected sends without replacing the caller request id", async () => {
    const socket = socketDouble();
    const client = createMessagingSocket({ ioFactory: vi.fn(() => socket) as unknown as SocketIoFactory, origin: "https://api.example.test" });
    const input = { conversationId: "conversation-1", body: "Hello", clientRequestId: "request-1" };
    socket.emit.mockImplementationOnce((_event: string, _input: unknown, callback: (error: Error) => void) => callback(new Error("operation has timed out")));
    await expect(client.sendMessage(input)).rejects.toMatchObject({ name: "MessagingSocketError", code: "ack_timeout", retryable: true } satisfies Partial<MessagingSocketError>);

    socket.emit.mockImplementationOnce((_event: string, _input: unknown, callback: (error: null, result: unknown) => void) => callback(null, {
      ok: false,
      error: { code: "message_rate_limited", message: "Slow down", retryAfterSeconds: 60 }
    }));
    await expect(client.sendMessage(input)).rejects.toMatchObject({ code: "message_rate_limited", details: { retryAfterSeconds: 60 }, retryable: false } satisfies Partial<MessagingSocketError>);
    expect(socket.emit).toHaveBeenLastCalledWith("message:send", input, expect.any(Function));
  });

  it("publishes socket events, removes listeners, and stops reconnecting after session invalidation", () => {
    const socket = socketDouble();
    const states: string[] = [];
    const receivedMessages: string[] = [];
    const client = createMessagingSocket({ ioFactory: vi.fn(() => socket) as unknown as SocketIoFactory, origin: "https://api.example.test" });
    const stopConnection = client.onConnection((state) => states.push(state));
    const stopMessages = client.onMessage((next) => receivedMessages.push(next.id));

    socket.trigger("connect");
    socket.trigger("disconnect");
    socket.trigger("message:created", message);
    stopMessages();
    socket.trigger("message:created", { ...message, id: "message-43" });
    socket.trigger("session:invalid");
    stopConnection();

    expect(states).toEqual(["connected", "reconnecting", "session-invalid"]);
    expect(receivedMessages).toEqual(["message-42"]);
    expect(socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.off).toHaveBeenCalledWith("message:created", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("connect", expect.any(Function));
  });

  it("stops reconnecting for handshake session invalidation and exposes safe retry details", () => {
    const socket = socketDouble();
    const states: Array<{ state: string; code?: string; retryAfterSeconds?: number }> = [];
    const client = createMessagingSocket({ ioFactory: vi.fn(() => socket) as unknown as SocketIoFactory, origin: "https://api.example.test" });
    const stop = client.onConnection((state, issue) => states.push({
      state,
      code: issue?.code,
      retryAfterSeconds: issue?.details?.retryAfterSeconds
    }));

    socket.trigger("connect_error", Object.assign(new Error("Session is invalid"), { data: { code: "session_invalid", message: "Session is invalid" } }));
    socket.trigger("connect_error", Object.assign(new Error("Too many connection attempts"), { data: { code: "connection_rate_limited", message: "Try later", retryAfterSeconds: 17 } }));

    expect(states).toEqual([{ state: "session-invalid", code: "session_invalid", retryAfterSeconds: undefined }]);
    expect(socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    stop();

    const retrySocket = socketDouble();
    const retryStates: Array<{ state: string; retryAfterSeconds?: number }> = [];
    const retryClient = createMessagingSocket({ ioFactory: vi.fn(() => retrySocket) as unknown as SocketIoFactory, origin: "https://api.example.test" });
    retryClient.onConnection((state, issue) => retryStates.push({ state, retryAfterSeconds: issue?.details?.retryAfterSeconds }));
    retrySocket.trigger("connect_error", Object.assign(new Error("Try later"), { data: { code: "connection_rate_limited", message: "Try later", retryAfterSeconds: 17 } }));
    retrySocket.trigger("connect_error", Object.assign(new Error("Bad retry"), { data: { code: "connection_rate_limited", message: "Try later", retryAfterSeconds: -1 } }));
    expect(retryStates).toEqual([
      { state: "reconnecting", retryAfterSeconds: 17 },
      { state: "reconnecting", retryAfterSeconds: undefined }
    ]);
  });
});
