import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  acceptMessageRequest,
  createMessageRequest,
  getMessagingStatus,
  getMessages,
  getUnreadSummary,
  listConversations,
  syncMessages
} from "../api";

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

describe("messaging API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a message request with cookies and returns its full envelope", async () => {
    const input = {
      techProfileId: "tech / 1",
      body: "Hello",
      clientRequestId: "d08d5fca-5ab3-4e47-bb26-a1aefee614a6"
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { conversation, message } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createMessageRequest(input)).resolves.toEqual({ conversation, message });
    expect(fetchMock).toHaveBeenCalledWith("/api/messaging/requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  });

  it("uses encoded identifiers and decimal sequence cursors for authenticated inbox resources", async () => {
    const unread = { unreadMessages: 1, pendingRequests: 0, total: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { conversations: [conversation], nextCursor: "next / cursor", syncSequence: "9007199254740993" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { messages: [message], nextSequence: "41", hasMore: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { messages: [message], nextSequence: "42", hasMore: false, unread } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: unread }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConversations({ archived: false, status: "ACCEPTED", cursor: "next / cursor", limit: 30 })).resolves.toMatchObject({ syncSequence: "9007199254740993" });
    await expect(getMessages("conversation / 1", { beforeSequence: "9007199254740993", limit: 50 })).resolves.toMatchObject({ nextSequence: "41" });
    await expect(syncMessages({ afterSequence: "9007199254740993", limit: 100 })).resolves.toMatchObject({ unread });
    await expect(getUnreadSummary()).resolves.toEqual(unread);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/messaging/conversations?archived=false&status=ACCEPTED&cursor=next+%2F+cursor&limit=30", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/messaging/conversations/conversation%20%2F%201/messages?beforeSequence=9007199254740993&limit=50", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/messaging/sync?afterSequence=9007199254740993&limit=100", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/messaging/unread-summary", { credentials: "include" });
  });

  it("reports the server-owned messaging capability and preserves failure details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { enabled: false } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "request_cooldown", message: "Try again later", details: { nextAllowedAt: "2026-09-01T00:00:00.000Z" } } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "messaging_rate_limited", message: "Slow down", details: { retryAfterSeconds: 60 } } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "messaging_blocked", message: "Conversation is blocked" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMessagingStatus()).resolves.toEqual({ enabled: false });
    await expect(createMessageRequest({ techProfileId: "tech-1", body: "Hello", clientRequestId: "d08d5fca-5ab3-4e47-bb26-a1aefee614a6" }))
      .rejects.toMatchObject({ status: 429, code: "request_cooldown", details: { nextAllowedAt: "2026-09-01T00:00:00.000Z" } } satisfies Partial<ApiClientError>);
    await expect(acceptMessageRequest("conversation-1"))
      .rejects.toMatchObject({ status: 429, code: "messaging_rate_limited", details: { retryAfterSeconds: 60 } } satisfies Partial<ApiClientError>);
    await expect(acceptMessageRequest("conversation-1"))
      .rejects.toMatchObject({ status: 403, code: "messaging_blocked", message: "Conversation is blocked" } satisfies Partial<ApiClientError>);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/messaging/status");
  });
});
