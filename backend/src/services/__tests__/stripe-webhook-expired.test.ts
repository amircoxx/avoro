import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn()
}));
vi.mock("../purchasing/stripe.client", () => ({
  stripe: { webhooks: { constructEvent: mocks.constructEvent } }
}));
vi.mock("../../models/database.model", () => ({ prisma: {
  checkoutAttempt: { findUnique: mocks.findUnique, updateMany: mocks.updateMany }
} }));
import { stripeWebhookHandler } from "../../controllers/stripe-webhook.controller";

function handle(session: object = { id: "cs_1", metadata: { checkoutAttemptId: "attempt-1" } }) {
  mocks.constructEvent.mockReturnValue({ type: "checkout.session.expired", data: { object: session } });
  const response = { status: vi.fn().mockReturnThis(), send: vi.fn(), sendStatus: vi.fn() };
  const result = stripeWebhookHandler(
    { get: () => "signature", body: Buffer.from("payload") } as unknown as Request,
    response as unknown as Response,
    vi.fn()
  );
  return { result, response };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-secret");
  mocks.findUnique.mockResolvedValue({ id: "attempt-1", sessionId: "cs_1" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("expired checkout webhook", () => {
  it("expires only the matching open attempt and acknowledges the event", async () => {
    const { result, response } = handle();
    await result;
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "attempt-1", sessionId: "cs_1", state: "OPEN" },
      data: { state: "EXPIRED" }
    });
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("acknowledges a no-op when the attempt is already expired or completed", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const { result, response } = handle();
    await result;
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it.each([{ id: "cs_1" }, { metadata: { checkoutAttemptId: "attempt-1" } }])(
    "rejects missing identifiers before database access", async (session) => {
      const { result, response } = handle(session);
      await result;
      expect(response.status).toHaveBeenCalledWith(400);
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
    }
  );

  it("rejects an unknown attempt", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(handle().result).rejects.toMatchObject({ status: 404 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a session belonging to another attempt", async () => {
    mocks.findUnique.mockResolvedValue({ id: "attempt-1", sessionId: "cs_other" });
    await expect(handle().result).rejects.toThrow("Stripe session ID does not match the checkout attempt");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("propagates write failures without acknowledging success", async () => {
    const error = new Error("Database unavailable");
    mocks.updateMany.mockRejectedValue(error);
    const { result, response } = handle();
    await expect(result).rejects.toBe(error);
    expect(response.sendStatus).not.toHaveBeenCalled();
  });
});
