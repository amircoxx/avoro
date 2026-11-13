import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession, createBillingPortalSession } from "../api/purchases";

afterEach(() => vi.unstubAllGlobals());
function respond(data: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("billing portal API", () => {
  it("creates a fresh portal session with cookies and no client identity", async () => {
    const url = "https://billing.stripe.com/p/session/example";
    const fetch = respond({ data: { url } });
    await expect(createBillingPortalSession()).resolves.toEqual({ url });
    expect(fetch).toHaveBeenCalledWith("/api/purchases/portal", { method: "POST", credentials: "include" });
  });

  it.each([null, {}, { url: 42 }, { url: "not-a-url" },
    { url: "http://billing.stripe.com/test" }, { url: "https://billing.stripe.com.evil.example/test" },
    { url: "https://user:pass@billing.stripe.com/test" }, { url: "https://billing.stripe.com:444/test" },
    { url: "https://checkout.stripe.com/test" }])("rejects untrusted portal URLs: %j", async (data) => {
    respond({ data });
    await expect(createBillingPortalSession()).rejects.toThrow();
  });

  it("preserves missing billing account errors", async () => {
    respond({ error: { code: "missing_billing_account", message: "Choose a plan first" } }, 409);
    await expect(createBillingPortalSession()).rejects.toMatchObject({ status: 409, code: "missing_billing_account" });
  });
});

describe("checkout API", () => {
  it("posts only plan and interval with session cookies and returns the hosted URL", async () => {
    const url = "https://checkout.stripe.com/c/pay/cs_test_example#session";
    const fetch = respond({ data: { url } });
    await expect(createCheckoutSession({ planId: "studio", interval: "yearly" })).resolves.toEqual({ url });
    expect(fetch).toHaveBeenCalledWith("/api/purchases/checkout", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "studio", interval: "yearly" })
    });
  });

  it.each([null, {}, { url: 42 }, { url: "not-a-url" },
    { url: "https://checkout.stripe.com:444/test" }, { url: "javascript:alert(1)" }, { url: "http://checkout.stripe.com/test" },
    { url: "https://checkout.stripe.com.evil.example/test" }, { url: "https://evil.example" },
    { url: "https://user:pass@checkout.stripe.com/test" }])("rejects malformed or untrusted checkout responses: %j", async (data) => {
    respond({ data });
    await expect(createCheckoutSession({ planId: "starter", interval: "monthly" })).rejects.toThrow();
  });

  it("preserves authentication errors for the UI", async () => {
    respond({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
    await expect(createCheckoutSession({ planId: "starter", interval: "monthly" })).rejects.toMatchObject({ status: 401 });
  });
});
