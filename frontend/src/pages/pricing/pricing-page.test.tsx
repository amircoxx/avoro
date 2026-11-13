import { act } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingPage from "./pricing-page";
import { ApiClientError } from "@/services/api/client";
const { createCheckoutSession, createBillingPortalSession } = vi.hoisted(() => ({ createCheckoutSession: vi.fn(), createBillingPortalSession: vi.fn() }));
vi.mock("@/services/api/purchases", () => ({ createCheckoutSession, createBillingPortalSession }));

const cleanups: Array<() => Promise<void>> = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.resetAllMocks(); });

async function render() {
  const window = new Window();
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<PricingPage />));
  cleanups.push(async () => { await act(async () => root.unmount()); await window.happyDOM.close(); Object.assign(globalThis, previous); });
  const click = async (name: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === name);
    if (!button) throw new Error(`Missing button: ${name}`);
    await act(async () => button.click());
  };
  return { container, click, location: window.location };
}

describe("PricingPage", () => {
  it("opens the portal and blocks checkout and repeated portal clicks during navigation", async () => {
    let resolve!: (value: { url: string }) => void;
    createBillingPortalSession.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = await render();
    const assign = vi.spyOn(view.location, "assign").mockImplementation(() => {});
    await view.click("Manage subscription");
    expect(view.container.textContent).toContain("Opening billing portal");
    await view.click("Choose Studio");
    await view.click("Opening billing portal…");
    expect(createBillingPortalSession).toHaveBeenCalledTimes(1);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    await act(async () => resolve({ url: "https://billing.stripe.com/p/session/example" }));
    expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session/example");
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(6);
  });

  it.each([
    [401, "unauthorized", "Please sign in to manage your subscription."],
    [403, "forbidden", "Subscription management is available to tech accounts only."],
    [409, "missing_billing_account", "Choose a plan first to set up your billing account."],
    [500, "internal_error", "We couldn’t open billing management. Please try again."]
  ])("shows a useful portal error for %s and permits retry", async (status, code, message) => {
    createBillingPortalSession.mockRejectedValue(new ApiClientError({ status: status as number, code: code as string, message: "private details" }));
    const view = await render();
    await view.click("Manage subscription");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(0);
    await view.click("Manage subscription");
    expect(createBillingPortalSession).toHaveBeenCalledTimes(2);
  });

  it("switches billing periods and shows the actual annual charge", async () => {
    const view = await render();
    expect(view.container.textContent).toContain("$12");
    await view.click("Yearly");
    expect(view.container.textContent).toContain("$120 billed yearly");
    expect(view.container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Yearly");
    await view.click("Monthly");
    expect(view.container.textContent).toContain("$12 billed monthly");
  });

  it("redirects to the returned Stripe URL with the selected plan and interval", async () => {
    const url = "https://checkout.stripe.com/c/pay/cs_test_example";
    createCheckoutSession.mockResolvedValue({ url });
    const view = await render();
    const assign = vi.spyOn(view.location, "assign").mockImplementation(() => {});
    await view.click("Yearly");
    await view.click("Choose Studio");
    expect(createCheckoutSession).toHaveBeenCalledWith({ planId: "studio", interval: "yearly" });
    expect(assign).toHaveBeenCalledWith(url);
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(6);
  });

  it("blocks repeated clicks while waiting and allows retry after failure", async () => {
    let reject!: (error: Error) => void;
    createCheckoutSession.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const view = await render();
    await view.click("Choose Starter");
    expect(view.container.textContent).toContain("Opening checkout…");
    await view.click("Choose Studio");
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("private server details")));
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Please try again");
    expect(view.container.textContent).not.toContain("private server details");
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(0);
    createCheckoutSession.mockRejectedValue(new Error("Unavailable"));
    await view.click("Choose Starter");
    expect(createCheckoutSession).toHaveBeenCalledTimes(2);
  });

  it("explains when sign-in is required", async () => {
    createCheckoutSession.mockRejectedValue(new ApiClientError({ status: 401, message: "Unauthorized" }));
    const view = await render();
    await view.click("Choose Starter");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("sign in");
  });

  it("directs existing subscribers to management instead of retrying checkout", async () => {
    createCheckoutSession.mockRejectedValue(new ApiClientError({ status: 409, code: "existing_subscription", message: "Existing subscription" }));
    const view = await render();
    await view.click("Choose Studio");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe("You already have a subscription. Use Manage subscription to review or change your plan.");
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(0);
  });

  it("explains that checkout requires a tech account when access is forbidden", async () => {
    createCheckoutSession.mockRejectedValue(new ApiClientError({
      status: 403, code: "forbidden", message: "Insufficient permissions"
    }));
    const view = await render();
    const assign = vi.spyOn(view.location, "assign").mockImplementation(() => {});
    await view.click("Choose Studio");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
      "Plans are available to tech accounts only. Please sign in with a tech account to subscribe."
    );
    expect(assign).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("button:disabled")).toHaveLength(0);
  });
});
