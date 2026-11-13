import request from "supertest";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), findAccount: vi.fn(), createSession: vi.fn() }));
const config = vi.hoisted(() => ({ FRONTEND_ORIGIN: "http://localhost:3000", APP_PUBLIC_URL: undefined as string | undefined, STRIPE_PORTAL_CONFIGURATION_ID: undefined as string | undefined }));
vi.mock("../services/session.service", () => ({ requireRole: mocks.requireRole }));
vi.mock("../models/purchasing.model", () => ({ findPurchasingAccount: mocks.findAccount }));
vi.mock("../services/purchasing/stripe.client", () => ({ stripe: { billingPortal: { sessions: { create: mocks.createSession } } } }));
vi.mock("../config/env", () => ({ env: config }));
import { purchasesRouter } from "../routes/purchasing.routes";
import { errorHandler } from "../middleware/error.middleware";

// The repository's minimal Supertest declaration omits headers and .set().
type HttpResult = { status: number; headers: Record<string, string>; body: { error: { code: string }; data?: { url: string } } };
type HttpRequest = { set(name: string, value: string): HttpRequest; send(body: unknown): Promise<HttpResult> };
const http = request as unknown as (app: express.Express) => { post(path: string): HttpRequest };

const app = express();
app.use(express.json());
app.use("/api/purchases", purchasesRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.resetAllMocks();
  config.APP_PUBLIC_URL = undefined;
  config.STRIPE_PORTAL_CONFIGURATION_ID = undefined;
  mocks.requireRole.mockResolvedValue({ id: "user-owner" });
  mocks.findAccount.mockResolvedValue({ subscription: { stripeCustomerId: "cus_owner", status: "FREE" } });
  mocks.createSession.mockResolvedValue({ url: "https://billing.stripe.com/p/session/example" });
});

describe("customer portal", () => {
  it("uses the authenticated account, ignores injected parameters and prevents caching", async () => {
    const response = await http(app).post("/api/purchases/portal").set("Cookie", "session=owner").send({
      customer: "cus_other", return_url: "https://evil.example", configuration: "bpc_other"
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { url: "https://billing.stripe.com/p/session/example" } });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.requireRole).toHaveBeenCalledWith("session=owner", ["TECH"]);
    expect(mocks.findAccount).toHaveBeenCalledWith("user-owner");
    expect(mocks.createSession).toHaveBeenCalledWith({ customer: "cus_owner", return_url: "http://localhost:3000/pricing" });
  });

  it.each([401, 403])("blocks unauthorized requests (%s) before accessing billing", async (status) => {
    mocks.requireRole.mockRejectedValue(new AppError("Access denied", status));
    expect((await http(app).post("/api/purchases/portal").send({})).status).toBe(status);
    expect(mocks.findAccount).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each([null, { subscription: null }, { subscription: { stripeCustomerId: null } }])("rejects missing billing accounts: %j", async (account) => {
    mocks.findAccount.mockResolvedValue(account);
    const response = await http(app).post("/api/purchases/portal").send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("missing_billing_account");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each(["FREE", "ACTIVE", "PAST_DUE", "CANCELED"])("allows a saved customer with status %s to manage billing", async (status) => {
    mocks.findAccount.mockResolvedValue({ subscription: { stripeCustomerId: "cus_owner", status } });
    expect((await http(app).post("/api/purchases/portal").send({})).status).toBe(200);
  });

  it("uses server-selected configuration and public return origin", async () => {
    config.APP_PUBLIC_URL = "https://avoro.example";
    config.STRIPE_PORTAL_CONFIGURATION_ID = "bpc_approved";
    await http(app).post("/api/purchases/portal").send({});
    expect(mocks.createSession).toHaveBeenCalledWith({ customer: "cus_owner", return_url: "https://avoro.example/pricing", configuration: "bpc_approved" });
  });

  it("does not expose Stripe failures or return a successful session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSession.mockRejectedValue(new Error("private Stripe details"));
    const response = await http(app).post("/api/purchases/portal").send({});
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private Stripe details");
    expect(response.body.data).toBeUndefined();
    vi.restoreAllMocks();
  });
});
