import { Window } from "happy-dom";
import { act, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountRecoveryError } from "../account-recovery-actions";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const initialWindow = new Window();
Object.assign(globalThis, { window: initialWindow, document: initialWindow.document, HTMLElement: initialWindow.HTMLElement, Event: initialWindow.Event });
const { createRoot } = await import("react-dom/client");
const { AccountRecoveryPanel } = await import("../account-recovery-panel");
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.restoreAllMocks(); });

describe("account recovery frontend", () => {
  it("sends a reset request through the API and shows a neutral confirmation", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { message: "If an account matches, check your inbox." } }), { status: 200 })
    );
    const view = await render({ flow: "forgot", initialEmail: "client@example.com" });
    await view.submit();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/auth/forgot-password", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "client@example.com" })
    });
    expect(view.container.textContent).toContain("Check your inbox");
    expect(view.container.textContent).toContain("If an account matches");
  });

  it("sends the token and new password through the API before showing success", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { passwordReset: true } }), { status: 200 })
    );
    const view = await render({ flow: "reset", token: "test-token" });
    await view.fill("newPassword", "a-long-new-password");
    await view.fill("confirmPassword", "a-long-new-password");
    await view.submit();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/auth/reset-password", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-token", newPassword: "a-long-new-password" })
    });
    expect(view.container.textContent).toContain("Password updated");
    expect(view.container.querySelector('input[type="password"]')).toBeNull();
  });

  it("translates a backend invalid-token error into the unusable-link screen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "invalid_reset_token", message: "Invalid or expired token" } }), { status: 400 })
    );
    const view = await render({ flow: "reset", token: "expired-token" });
    await view.fill("newPassword", "a-long-new-password");
    await view.fill("confirmPassword", "a-long-new-password");
    await view.submit();
    expect(view.container.textContent).toContain("This link cannot be used");
    expect(view.container.textContent).not.toContain("Password updated");
  });

  it.each([120, undefined])("uses the backend retry delay or its fallback (%s)", async (seconds) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: {
        code: "rate_limited", message: "Too many requests",
        details: seconds === undefined ? {} : { retryAfterSeconds: seconds }
      } }), { status: 429 })
    );
    const view = await render({ flow: "forgot", initialEmail: "client@example.com" });
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Too many attempts");
    const button = view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(`Try again in ${seconds ?? 60}s`);
    await view.submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain("Check your inbox");
  });

  it("shows a generic error rather than success when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const view = await render({ flow: "forgot", initialEmail: "client@example.com" });
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("We could not complete your request");
    expect(view.container.textContent).not.toContain("Check your inbox");
    expect(view.container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("waits for the request result and shows a neutral email confirmation", async () => {
    let finish!: () => void;
    const requestReset = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = await render({ flow: "forgot", initialEmail: "client@example.com", actions: { requestReset } });
    await view.submit();
    expect(view.container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(view.container.textContent).not.toContain("Check your inbox");
    await act(async () => finish());
    expect(requestReset).toHaveBeenCalledWith("client@example.com");
    expect(view.container.textContent).toContain("If an account matches");
    expect(view.container.querySelector('input[type="password"]')).toBeNull();
  });

  it("rejects mismatched passwords before handing off a reset", async () => {
    const resetPassword = vi.fn();
    const view = await render({ flow: "reset", token: "test-token", actions: { resetPassword } });
    await view.fill("newPassword", "a-long-new-password");
    await view.fill("confirmPassword", "a-different-password");
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("do not match");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a short password before handing off a reset", async () => {
    const resetPassword = vi.fn();
    const view = await render({ flow: "reset", token: "test-token", actions: { resetPassword } });
    await view.fill("newPassword", "short");
    await view.fill("confirmPassword", "short");
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("12 and 200");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("validates email before requesting a reset", async () => {
    const requestReset = vi.fn();
    const view = await render({ flow: "forgot", actions: { requestReset } });
    await view.fill("email", "not-an-email");
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("valid email");
    expect(requestReset).not.toHaveBeenCalled();
  });

  it("requests verification without a token using the email callback", async () => {
    const resendVerification = vi.fn(async () => {});
    const view = await render({ flow: "verify", actions: { resendVerification } });
    await view.fill("email", "client@example.com");
    await view.submit();
    expect(resendVerification).toHaveBeenCalledWith("client@example.com");
    expect(view.container.textContent).toContain("needs verification");
    expect(view.container.textContent).not.toContain("Email verified");
  });

  it("hands off the token and password, then clears password fields on success", async () => {
    const resetPassword = vi.fn(async () => {});
    const view = await render({ flow: "reset", token: "test-token", actions: { resetPassword } });
    await view.fill("newPassword", "a-long-new-password");
    await view.fill("confirmPassword", "a-long-new-password");
    await view.submit();
    expect(resetPassword).toHaveBeenCalledWith({ token: "test-token", newPassword: "a-long-new-password" });
    expect(view.container.textContent).toContain("Password updated");
    expect(view.container.querySelector('input')).toBeNull();
  });

  it("offers a fresh reset link when the token is missing or expired", async () => {
    const view = await render({ flow: "reset" });
    expect(view.container.textContent).toContain("This link cannot be used");
    await view.click("Request a new link");
    expect(view.container.querySelector('input[name="email"]')).not.toBeNull();
  });

  it("handles an expired verification link without claiming verification", async () => {
    const verifyEmail = vi.fn(async () => { throw new AccountRecoveryError("expired"); });
    const view = await render({ flow: "verify", token: "expired-token", actions: { verifyEmail } });
    await view.submit();
    expect(view.container.textContent).toContain("This link cannot be used");
    await view.click("Request a new link");
    expect(view.container.textContent).toContain("Verify your email");
    expect(view.container.querySelector('input[name="email"]')).not.toBeNull();
  });

  it("verifies only after confirmation and leaves login to the user", async () => {
    const verifyEmail = vi.fn(async () => {});
    const onLogin = vi.fn();
    const view = await render({ flow: "verify", token: "test-token", actions: { verifyEmail }, onLogin });
    expect(verifyEmail).not.toHaveBeenCalled();
    await view.submit();
    expect(view.container.textContent).toContain("Email verified");
    expect(onLogin).not.toHaveBeenCalled();
    await view.click("Back to log in");
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("disables retries while the supplied rate-limit period is active", async () => {
    const requestReset = vi.fn(async () => { throw new AccountRecoveryError("rate_limited", 30); });
    const view = await render({ flow: "forgot", initialEmail: "client@example.com", actions: { requestReset } });
    await view.submit();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Too many attempts");
    expect(view.container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});

async function render(props: Partial<ComponentProps<typeof AccountRecoveryPanel>> & { flow: "forgot" | "reset" | "verify" }) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Event: window.Event, Node: window.Node });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => { act(() => root.unmount()); container.remove(); window.close(); });
  await act(async () => root.render(<AccountRecoveryPanel titleId="recovery-title" onLogin={() => {}} {...props} />));
  return {
    container,
    async submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); },
    async fill(name: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async click(label: string) {
      const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label)!;
      await act(async () => button.click());
    }
  };
}
