import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const config = vi.hoisted(() => ({
  env: { FRONTEND_ORIGIN: "http://localhost:3000", MESSAGING_ENABLED: false, STRIPE_SECRET_KEY: "sk_test_placeholder" }
}));
const session = vi.hoisted(() => ({ requireCurrentUser: vi.fn(), requireRole: vi.fn() }));
const messaging = vi.hoisted(() => ({
  findAuthorizedRequestReplay: vi.fn(),
  createRequest: vi.fn(),
  acceptRequest: vi.fn(),
  declineRequest: vi.fn(),
  listConversations: vi.fn(),
  getUnreadSummary: vi.fn(),
  syncMessages: vi.fn(),
  listMessages: vi.fn(),
  markRead: vi.fn(),
  setArchived: vi.fn(),
  blockConversation: vi.fn(),
  unblockConversation: vi.fn()
}));
const telemetry = vi.hoisted(() => ({ recordRateLimit: vi.fn() }));

vi.mock("../config/env", () => config);
vi.mock("../services/session.service", () => session);
vi.mock("../services/messaging.service", () => ({ messagingService: messaging }));
vi.mock("../services/messaging-observability", () => ({ messagingTelemetry: telemetry }));

import { app } from "../app";

const customer = {
  id: "8b0d91cb-7851-46dd-a0de-9a9eb04aa701",
  email: "customer@example.test",
  role: "CUSTOMER" as const,
  fullName: "Customer",
  avatarUrl: null
};
const tech = { ...customer, id: "c326402e-dd8b-47f4-bb7e-4d411e17bf94", role: "TECH" as const };
const rateLimitedCustomer = { ...customer, id: "026cc2e9-276e-44d1-b028-516cb8cbab2a" };
const conversationId = "a822c613-0a54-43db-ae2e-7b4be81e87d0";
const createInput = {
  techProfileId: "be01c6b7-77dc-4599-b7ad-40c09ce890f8",
  body: "Could we discuss an appointment?",
  clientRequestId: "dd8786f0-860f-4367-8215-90a7131178b5"
};
const conversation = { id: conversationId, status: "PENDING" };

describe("messaging API feature gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.env.MESSAGING_ENABLED = false;
  });

  it("always exposes disabled messaging status", async () => {
    const response = await request(app).get("/api/messaging/status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { enabled: false } });
  });

  it("hides messaging mutations when messaging is disabled", async () => {
    const response = await request(app).post("/api/messaging/requests").send(createInput);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "not_found", message: "Route not found" } });
    expect(session.requireRole).not.toHaveBeenCalled();
  });
});

describe("messaging API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.env.MESSAGING_ENABLED = true;
  });

  it("creates a customer request with 201 and returns 200 for a replay", async () => {
    session.requireRole.mockResolvedValue(customer);
    messaging.createRequest.mockResolvedValueOnce({ replayed: false, conversation, message: { id: "message-1" } });
    messaging.createRequest.mockResolvedValueOnce({ replayed: true, conversation, message: { id: "message-1" } });

    const created = await request(app).post("/api/messaging/requests").send(createInput);
    const replayed = await request(app).post("/api/messaging/requests").send(createInput);

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(created.body).toEqual({ data: { conversation, message: { id: "message-1" } } });
    expect(messaging.createRequest).toHaveBeenCalledWith(customer.id, createInput);
  });

  it("requires a customer and rejects invalid request bodies before calling the service", async () => {
    session.requireRole.mockResolvedValue(customer);

    const response = await request(app).post("/api/messaging/requests").send({ techProfileId: "not-a-uuid" });

    expect(response.status).toBe(422);
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["CUSTOMER"]);
    expect(messaging.createRequest).not.toHaveBeenCalled();
  });

  it("makes accept and decline tech-only lifecycle calls", async () => {
    session.requireRole.mockResolvedValue(tech);
    messaging.acceptRequest.mockResolvedValue({ ...conversation, status: "ACCEPTED" });
    messaging.declineRequest.mockResolvedValue({ ...conversation, status: "DECLINED" });

    const accepted = await request(app).post(`/api/messaging/conversations/${conversationId}/accept`).send({});
    const declined = await request(app).post(`/api/messaging/conversations/${conversationId}/decline`).send({});

    expect(accepted.status).toBe(200);
    expect(declined.status).toBe(200);
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["TECH"]);
    expect(messaging.acceptRequest).toHaveBeenCalledWith({ id: tech.id, role: "TECH" }, conversationId);
    expect(messaging.declineRequest).toHaveBeenCalledWith({ id: tech.id, role: "TECH" }, conversationId);
  });

  it("forwards validated inbox, history, and sync cursors only for the current member", async () => {
    session.requireCurrentUser.mockResolvedValue(customer);
    messaging.listConversations.mockResolvedValue({ conversations: [], nextCursor: null, syncSequence: "45" });
    messaging.listMessages.mockResolvedValue({ messages: [], nextSequence: "41", hasMore: true });
    messaging.syncMessages.mockResolvedValue({ messages: [], nextSequence: "45", hasMore: false, unread: { unreadMessages: 0, pendingRequests: 0, total: 0 } });

    const inbox = await request(app).get("/api/messaging/conversations?status=ACCEPTED&archived=true&cursor=page-2&limit=5");
    const history = await request(app).get(`/api/messaging/conversations/${conversationId}/messages?beforeSequence=42&limit=5`);
    const sync = await request(app).get("/api/messaging/sync?afterSequence=42&limit=5");

    expect(inbox.status).toBe(200);
    expect(history.status).toBe(200);
    expect(sync.status).toBe(200);
    expect(messaging.listConversations).toHaveBeenCalledWith(
      { id: customer.id, role: "CUSTOMER" },
      { status: "ACCEPTED", archived: true, cursor: "page-2", limit: 5 }
    );
    expect(messaging.listMessages).toHaveBeenCalledWith(
      { id: customer.id, role: "CUSTOMER" }, conversationId, { beforeSequence: "42", limit: 5 }
    );
    expect(messaging.syncMessages).toHaveBeenCalledWith(
      { id: customer.id, role: "CUSTOMER" }, { afterSequence: "42", limit: 5 }
    );
  });

  it("returns unread, read, archive, and block results for the authenticated participant", async () => {
    session.requireCurrentUser.mockResolvedValue(customer);
    messaging.getUnreadSummary.mockResolvedValue({ unreadMessages: 2, pendingRequests: 1, total: 3 });
    messaging.markRead.mockResolvedValue({ throughSequence: "42" });
    const archivedConversation = { ...conversation, archivedAt: "2026-08-15T12:00:00.000Z", isBlocked: false, canManageBlock: true, stateVersion: "2" };
    const restoredConversation = { ...archivedConversation, archivedAt: null, stateVersion: "3" };
    messaging.setArchived
      .mockResolvedValueOnce({ conversation: archivedConversation, archived: true })
      .mockResolvedValueOnce({ conversation: restoredConversation, archived: false });
    messaging.blockConversation.mockResolvedValue({ ...restoredConversation, isBlocked: true, stateVersion: "4" });
    messaging.unblockConversation.mockResolvedValue({ ...restoredConversation, isBlocked: false, stateVersion: "5" });

    const unread = await request(app).get("/api/messaging/unread-summary");
    const read = await request(app).post(`/api/messaging/conversations/${conversationId}/read`).send({ throughSequence: "42" });
    const archived = await request(app).post(`/api/messaging/conversations/${conversationId}/archive`).send({});
    const restored = await request(app).delete(`/api/messaging/conversations/${conversationId}/archive`);
    const blocked = await request(app).post("/api/messaging/blocks").send({ conversationId });
    const unblocked = await request(app).delete(`/api/messaging/blocks/${conversationId}`);

    expect(unread.body).toEqual({ data: { unreadMessages: 2, pendingRequests: 1, total: 3 } });
    expect(read.body).toEqual({ data: { throughSequence: "42" } });
    expect(archived.body).toEqual({ data: { conversation: archivedConversation, archived: true } });
    expect(restored.body).toEqual({ data: { conversation: restoredConversation, archived: false } });
    expect(blocked.body).toEqual({ data: { conversation: { ...restoredConversation, isBlocked: true, stateVersion: "4" } } });
    expect(unblocked.body).toEqual({ data: { conversation: { ...restoredConversation, isBlocked: false, stateVersion: "5" } } });
    expect(messaging.setArchived).toHaveBeenNthCalledWith(1, customer.id, conversationId, true);
    expect(messaging.setArchived).toHaveBeenNthCalledWith(2, customer.id, conversationId, false);
    expect(messaging.blockConversation).toHaveBeenCalledWith(customer.id, conversationId);
    expect(messaging.unblockConversation).toHaveBeenCalledWith(customer.id, conversationId);
  });

  it("preserves stable lifecycle errors and cooldown details", async () => {
    session.requireRole.mockResolvedValue(customer);
    messaging.createRequest.mockRejectedValueOnce(new AppError("A message request is already pending", 409, "request_pending"));
    messaging.createRequest.mockRejectedValueOnce(new AppError(
      "You can send another message request after 2026-08-31T12:00:00.000Z",
      409,
      "request_cooldown",
      { nextAllowedAt: "2026-08-31T12:00:00.000Z" }
    ));

    const pending = await request(app).post("/api/messaging/requests").send(createInput);
    const cooldown = await request(app).post("/api/messaging/requests").send(createInput);

    expect(pending.status).toBe(409);
    expect(pending.body).toEqual({ error: { code: "request_pending", message: "A message request is already pending" } });
    expect(cooldown.body).toEqual({
      error: {
        code: "request_cooldown",
        message: "You can send another message request after 2026-08-31T12:00:00.000Z",
        details: { nextAllowedAt: "2026-08-31T12:00:00.000Z" }
      }
    });
  });

  it("returns a retryable 429 after the customer request limit", async () => {
    session.requireRole.mockResolvedValue(rateLimitedCustomer);
    messaging.createRequest.mockResolvedValue({ replayed: false, conversation, message: { id: "message-rate" } });

    for (let index = 0; index < 10; index += 1) {
      const response = await request(app).post("/api/messaging/requests").send({
        ...createInput,
        clientRequestId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      });
      expect(response.status).toBe(201);
    }
    const limited = await request(app).post("/api/messaging/requests").send(createInput);

    expect(limited.status).toBe(429);
    expect((limited as unknown as { headers: Record<string, string | undefined> }).headers["retry-after"]).toBe("86400");
    expect(limited.body).toEqual({
      error: {
        code: "messaging_rate_limited",
        message: "Too many messaging requests. Please try again later.",
        details: { retryAfterSeconds: 86400 }
      }
    });
    expect(telemetry.recordRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      scope: "http_request",
      actorUserId: rateLimitedCustomer.id,
      retryAfterSeconds: 86_400
    }));
  });

  it("replays an authorized original request after the new-request bucket is exhausted", async () => {
    const replayCustomer = { ...customer, id: "5160c32f-a8ff-4d25-a575-166e441451ea" };
    session.requireRole.mockResolvedValue(replayCustomer);
    messaging.findAuthorizedRequestReplay.mockResolvedValue(null);
    messaging.createRequest.mockResolvedValue({ replayed: false, conversation, message: { id: "message-original" } });

    const original = await request(app).post("/api/messaging/requests").send(createInput);
    for (let index = 0; index < 9; index += 1) {
      const response = await request(app).post("/api/messaging/requests").send({
        ...createInput,
        clientRequestId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      });
      expect(response.status).toBe(201);
    }

    messaging.findAuthorizedRequestReplay.mockResolvedValueOnce({ replayed: true, conversation, message: { id: "message-original" } });
    const replayed = await request(app).post("/api/messaging/requests").send(createInput);
    const newRequest = await request(app).post("/api/messaging/requests").send({
      ...createInput,
      clientRequestId: "20000000-0000-4000-8000-000000000001"
    });

    expect(original.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(replayed.body).toEqual({ data: { conversation, message: { id: "message-original" } } });
    expect(newRequest.status).toBe(429);
    expect(messaging.createRequest).toHaveBeenCalledTimes(10);
  });
});
