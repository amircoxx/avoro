import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadLocalEnv = vi.hoisted(() => vi.fn());

vi.mock("../load-local-env", () => ({ loadLocalEnv }));

const keys = [
  "NODE_ENV",
  "PORT",
  "FRONTEND_ORIGIN",
  "BREVO_API_KEY",
  "BOOKING_EMAIL_FROM",
  "BOOKING_EMAIL_FROM_NAME",
  "APP_PUBLIC_URL",
  "DATABASE_URL",
  "MESSAGING_ENABLED",
  "STRIPE_SECRET_KEY"
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

describe("backend environment construction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "test";
    loadLocalEnv.mockImplementation(() => {
      process.env.BREVO_API_KEY ??= "local-api-key";
      process.env.BOOKING_EMAIL_FROM ??= "local@example.test";
      process.env.BOOKING_EMAIL_FROM_NAME ??= "Local Bookings";
      process.env.APP_PUBLIC_URL ??= "http://localhost:3000";
      process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
    });
  });

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("loads local values before constructing the exported environment", async () => {
    const { env } = await import("../env");

    expect(loadLocalEnv).toHaveBeenCalledOnce();
    expect(env).toMatchObject({
      BREVO_API_KEY: "local-api-key",
      BOOKING_EMAIL_FROM: "local@example.test",
      BOOKING_EMAIL_FROM_NAME: "Local Bookings",
      APP_PUBLIC_URL: "http://localhost:3000",
      STRIPE_SECRET_KEY: "sk_test_placeholder"
    });
  });

  it("keeps process and deployment values authoritative over local defaults", async () => {
    process.env.BREVO_API_KEY = "deployment-api-key";
    process.env.BOOKING_EMAIL_FROM = "deployment@example.test";
    process.env.APP_PUBLIC_URL = "https://deployment.example";
    process.env.STRIPE_SECRET_KEY = "sk_test_deployment_placeholder";

    const { env } = await import("../env");

    expect(env).toMatchObject({
      BREVO_API_KEY: "deployment-api-key",
      BOOKING_EMAIL_FROM: "deployment@example.test",
      BOOKING_EMAIL_FROM_NAME: "Local Bookings",
      APP_PUBLIC_URL: "https://deployment.example",
      STRIPE_SECRET_KEY: "sk_test_deployment_placeholder"
    });
  });

  it.each([undefined, "", "   "])("rejects a missing or blank Stripe key: %s", async (value) => {
    loadLocalEnv.mockImplementation(() => {});
    if (value !== undefined) process.env.STRIPE_SECRET_KEY = value;

    await expect(import("../env")).rejects.toThrow("Stripe secret key is required");
  });

  it("trims whitespace from the Stripe key", async () => {
    process.env.STRIPE_SECRET_KEY = "  sk_test_placeholder  ";

    const { env } = await import("../env");

    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_placeholder");
  });

  it.each([
    ["true", true],
    [" TRUE ", true],
    ["false", false],
    ["1", false],
    [undefined, false]
  ])("enables messaging only for a case-insensitive true value", async (value, enabled) => {
    if (value !== undefined) process.env.MESSAGING_ENABLED = value;

    const { env } = await import("../env");

    expect(env.MESSAGING_ENABLED).toBe(enabled);
  });
});
