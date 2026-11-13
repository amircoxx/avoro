/** Cookie-authenticated Socket.IO transport for messaging events and acknowledged sends. */
import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import type { ConversationDto, MessageDto, SendMessageInput, SendMessageResult, UnreadSummaryDto } from "./api";

type ConnectionState = "connected" | "reconnecting" | "disconnected" | "session-invalid";
type SocketAcknowledgment =
  | { ok: true; message: MessageDto; conversation: ConversationDto }
  | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

type MessagingSocketIo = Pick<Socket, "connect" | "disconnect" | "on" | "off" | "emit" | "timeout"> & {
  io: Pick<Socket["io"], "reconnection">;
};

export type SocketIoFactory = (origin: string | undefined, options: Partial<ManagerOptions & SocketOptions>) => MessagingSocketIo;

export type MessagingSocket = {
  connect(): void;
  disconnect(): void;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  onMessage(listener: (message: MessageDto) => void): () => void;
  onConversation(listener: (conversation: ConversationDto) => void): () => void;
  onUnread(listener: (summary: UnreadSummaryDto) => void): () => void;
  onConnection(listener: (state: ConnectionState, issue?: MessagingSocketError) => void): () => void;
};

export class MessagingSocketError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Record<string, number> | undefined;

  constructor(message: string, code: string, retryable: boolean, details?: Record<string, number>) {
    super(message);
    this.name = "MessagingSocketError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

type MessagingSocketOptions = { ioFactory?: SocketIoFactory; origin?: string };

export function createMessagingSocket({ ioFactory = io as unknown as SocketIoFactory, origin = socketOrigin() }: MessagingSocketOptions = {}): MessagingSocket {
  // WebSocket handshakes carry Origin even on the same origin; polling GETs do
  // not, and cannot satisfy the gateway's strict origin authorization check.
  const socket = ioFactory(origin, { autoConnect: false, withCredentials: true, transports: ["websocket"], reconnection: true });
  const messageListeners = new Set<(message: MessageDto) => void>();
  const conversationListeners = new Set<(conversation: ConversationDto) => void>();
  const unreadListeners = new Set<(summary: UnreadSummaryDto) => void>();
  const connectionListeners = new Set<(state: ConnectionState, issue?: MessagingSocketError) => void>();
  let manuallyDisconnected = false;
  let sessionInvalid = false;

  const publishConnection = (state: ConnectionState, issue?: MessagingSocketError) => {
    for (const listener of connectionListeners) listener(state, issue);
  };
  const onConnect = () => {
    if (!sessionInvalid) publishConnection("connected");
  };
  const onDisconnect = (reason: string) => {
    if (sessionInvalid) return;
    publishConnection(manuallyDisconnected ? "disconnected" : "reconnecting");
    // Socket.IO retries transport failures automatically, but an explicit
    // server disconnect during graceful shutdown requires a new connect call.
    if (!manuallyDisconnected && reason === "io server disconnect") socket.connect();
  };
  const invalidateSession = (issue: MessagingSocketError) => {
    if (sessionInvalid) return;
    sessionInvalid = true;
    socket.io.reconnection(false);
    socket.disconnect();
    publishConnection("session-invalid", issue);
  };
  const onSessionInvalid = () => invalidateSession(new MessagingSocketError("Session is invalid", "session_invalid", false));
  const onConnectError = (error: unknown) => {
    if (sessionInvalid) return;
    const data = readHandshakeErrorData(error);
    const code = data?.code ?? "socket_connection_error";
    const issue = new MessagingSocketError(
      data?.message ?? "Messaging connection could not be established",
      code,
      code !== "session_invalid",
      data?.retryAfterSeconds ? { retryAfterSeconds: data.retryAfterSeconds } : undefined
    );
    if (code === "session_invalid") invalidateSession(issue);
    else publishConnection("reconnecting", issue);
  };
  const onMessage = (message: MessageDto) => {
    for (const listener of messageListeners) listener(message);
  };
  const onConversation = (conversation: ConversationDto) => {
    for (const listener of conversationListeners) listener(conversation);
  };
  const onUnread = (summary: UnreadSummaryDto) => {
    for (const listener of unreadListeners) listener(summary);
  };

  socket.on("session:invalid", onSessionInvalid);

  return {
    connect() {
      if (sessionInvalid) return;
      manuallyDisconnected = false;
      socket.connect();
    },
    disconnect() {
      manuallyDisconnected = true;
      socket.disconnect();
      publishConnection("disconnected");
    },
    async sendMessage(input) {
      return new Promise<SendMessageResult>((resolve, reject) => {
        socket.timeout(5_000).emit("message:send", input, (error: Error | null, result?: SocketAcknowledgment) => {
          if (error) {
            reject(new MessagingSocketError("Message acknowledgement timed out", "ack_timeout", true));
            return;
          }
          if (!result || !result.ok) {
            const failure = result && "error" in result ? result.error : { code: "socket_protocol_error", message: "Message could not be sent" };
            reject(new MessagingSocketError(
              failure.message,
              failure.code,
              false,
              typeof failure.retryAfterSeconds === "number" ? { retryAfterSeconds: failure.retryAfterSeconds } : undefined
            ));
            return;
          }
          resolve({ message: result.message, conversation: result.conversation });
        });
      });
    },
    onMessage(listener) {
      const wasEmpty = messageListeners.size === 0;
      messageListeners.add(listener);
      if (wasEmpty) socket.on("message:created", onMessage);
      return () => {
        messageListeners.delete(listener);
        if (messageListeners.size === 0) socket.off("message:created", onMessage);
      };
    },
    onConversation(listener) {
      const wasEmpty = conversationListeners.size === 0;
      conversationListeners.add(listener);
      if (wasEmpty) socket.on("conversation:updated", onConversation);
      return () => {
        conversationListeners.delete(listener);
        if (conversationListeners.size === 0) socket.off("conversation:updated", onConversation);
      };
    },
    onUnread(listener) {
      const wasEmpty = unreadListeners.size === 0;
      unreadListeners.add(listener);
      if (wasEmpty) socket.on("unread:changed", onUnread);
      return () => {
        unreadListeners.delete(listener);
        if (unreadListeners.size === 0) socket.off("unread:changed", onUnread);
      };
    },
    onConnection(listener) {
      const wasEmpty = connectionListeners.size === 0;
      connectionListeners.add(listener);
      if (wasEmpty) {
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("connect_error", onConnectError);
      }
      return () => {
        connectionListeners.delete(listener);
        if (connectionListeners.size === 0) {
          socket.off("connect", onConnect);
          socket.off("disconnect", onDisconnect);
          socket.off("connect_error", onConnectError);
        }
      };
    }
  };
}

function readHandshakeErrorData(error: unknown) {
  if (!(error instanceof Error) || !("data" in error) || typeof error.data !== "object" || error.data === null) return undefined;
  const raw = error.data as Record<string, unknown>;
  const code = typeof raw.code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(raw.code) ? raw.code : undefined;
  const message = typeof raw.message === "string" && raw.message.length > 0 && raw.message.length <= 200 ? raw.message : undefined;
  const retryAfterSeconds = typeof raw.retryAfterSeconds === "number" && Number.isInteger(raw.retryAfterSeconds) && raw.retryAfterSeconds > 0 && raw.retryAfterSeconds <= 86_400
    ? raw.retryAfterSeconds
    : undefined;
  return { code, message, retryAfterSeconds };
}

function socketOrigin() {
  const origin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, "");
  return origin || undefined;
}
