import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  startPasswordResetWorker: vi.fn(),
  startBookingDispatcher: vi.fn(),
  startMessagingDispatcher: vi.fn(),
  startEventBus: vi.fn(),
  attachGateway: vi.fn(),
  disconnect: vi.fn()
}));
const serverEnv = vi.hoisted(() => ({
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  PORT: 3001,
  FRONTEND_ORIGIN: "http://localhost:3000",
  BREVO_API_KEY: "api-key" as string | undefined,
  BOOKING_EMAIL_FROM: "bookings@example.com" as string | undefined,
  BOOKING_EMAIL_FROM_NAME: "Find My Tech" as string | undefined,
  APP_PUBLIC_URL: "https://findmytech.example" as string | undefined,
  DATABASE_URL: "postgresql://listener.example/messages" as string | undefined,
  MESSAGING_ENABLED: true
}));

vi.mock("../models/database.model", () => ({ prisma: { $disconnect: runtime.disconnect } }));
vi.mock("../services/email/password-reset-worker", () => ({ startPasswordResetWorker: runtime.startPasswordResetWorker }));
vi.mock("../services/email/outbox-dispatcher", () => ({ startOutboxDispatcher: runtime.startBookingDispatcher }));
vi.mock("../services/messaging/messaging-delivery-dispatcher", () => ({ startMessagingDeliveryDispatcher: runtime.startMessagingDispatcher }));
vi.mock("../realtime/messaging-event-bus", () => ({ startMessagingEventBus: runtime.startEventBus }));
vi.mock("../realtime/messaging.gateway", () => ({ attachMessagingGateway: runtime.attachGateway }));
vi.mock("../config/env", () => ({ env: serverEnv }));

import { startBookingServer } from "../server";

function fakeServer(order: string[] = [], listenError?: Error, autoListenEvent = true) {
  const server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port: number) => {
      order.push("http:start");
      if (autoListenEvent) queueMicrotask(() => server.emit(listenError ? "error" : "listening", listenError));
      return server;
    }),
    close: vi.fn((callback: (error?: Error) => void) => {
      order.push("http:stop");
      callback();
    })
  });
  return server;
}

describe("booking server lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.startPasswordResetWorker.mockReturnValue(vi.fn().mockResolvedValue(undefined));
    runtime.startBookingDispatcher.mockReturnValue(vi.fn());
    runtime.startMessagingDispatcher.mockReturnValue(vi.fn());
    runtime.startEventBus.mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn().mockResolvedValue(undefined) });
    runtime.disconnect.mockResolvedValue(undefined);
    serverEnv.BREVO_API_KEY = "api-key";
    serverEnv.BOOKING_EMAIL_FROM = "bookings@example.com";
    serverEnv.BOOKING_EMAIL_FROM_NAME = "Find My Tech";
    serverEnv.APP_PUBLIC_URL = "https://findmytech.example";
    serverEnv.DATABASE_URL = "postgresql://listener.example/messages";
    serverEnv.MESSAGING_ENABLED = true;
  });

  it("awaits the messaging listener before accepting HTTP connections", async () => {
    let resolveBus: ((stop: () => Promise<void>) => void) | undefined;
    runtime.startEventBus.mockReturnValue(new Promise((resolve) => { resolveBus = resolve; }));
    const server = fakeServer([], undefined, false);
    const started = startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never });

    await Promise.resolve();
    expect(server.listen).not.toHaveBeenCalled();
    resolveBus?.(vi.fn().mockResolvedValue(undefined));
    await vi.waitFor(() => expect(server.listen).toHaveBeenCalledWith(3001));
    let settled = false;
    void started.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    server.emit("listening");
    const result = await started;

    expect(runtime.startEventBus).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: "postgresql://listener.example/messages",
      onEvent: expect.any(Function)
    }));
    expect(runtime.attachGateway).toHaveBeenCalledWith(expect.objectContaining({
      server,
      frontendOrigin: "http://localhost:3000",
      enabled: true
    }));
    await result.shutdown();
  });

  it("starts both dispatchers with the server-owned feature and email configuration", async () => {
    const server = fakeServer();

    await startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never });

    expect(runtime.startPasswordResetWorker).toHaveBeenCalledOnce();
    expect(runtime.startBookingDispatcher).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "api-key",
      sender: { email: "bookings@example.com", name: "Find My Tech" },
      appPublicUrl: "https://findmytech.example"
    }));
    expect(runtime.startMessagingDispatcher).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      apiKey: "api-key",
      sender: { email: "bookings@example.com", name: "Find My Tech" },
      appPublicUrl: "https://findmytech.example"
    }));
  });

  it("starts the realtime runtime when messaging is enabled without Brevo configuration", async () => {
    serverEnv.BREVO_API_KEY = undefined;
    const server = fakeServer();
    const result = await startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never });

    expect(runtime.startPasswordResetWorker).not.toHaveBeenCalled();
    expect(runtime.startMessagingDispatcher).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, apiKey: undefined }));
    expect(runtime.attachGateway).toHaveBeenCalledOnce();
    expect(runtime.startEventBus).toHaveBeenCalledOnce();
    expect(server.listen).toHaveBeenCalledOnce();
    await result.shutdown();
  });

  it.each(["SIGINT", "SIGTERM"] as const)("shuts down dispatchers, sockets, listener, HTTP, and Prisma in order on %s", async (signal) => {
    const order: string[] = [];
    runtime.startPasswordResetWorker.mockReturnValue(async () => { order.push("password-reset-worker"); });
    runtime.startBookingDispatcher.mockReturnValue(() => order.push("booking-dispatcher"));
    runtime.startMessagingDispatcher.mockReturnValue(() => order.push("messaging-dispatcher"));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn(async () => { order.push("sockets"); }) });
    runtime.startEventBus.mockResolvedValue(async () => { order.push("event-bus"); });
    runtime.disconnect.mockImplementation(async () => { order.push("prisma"); });
    const server = fakeServer(order);
    const processTarget = new EventEmitter();

    await startBookingServer({ processTarget, createHttpServer: () => server as never });
    processTarget.emit(signal);
    await vi.waitFor(() => expect(runtime.disconnect).toHaveBeenCalledTimes(1));

    expect(order).toEqual([
      "http:start",
      "booking-dispatcher",
      "messaging-dispatcher",
      "sockets",
      "event-bus",
      "http:stop",
      "password-reset-worker",
      "prisma"
    ]);
    expect(processTarget.listenerCount("SIGINT")).toBe(0);
    expect(processTarget.listenerCount("SIGTERM")).toBe(0);
  });

  it("fails startup and cleans partial runtime state when the enabled listener cannot start", async () => {
    const order: string[] = [];
    runtime.startPasswordResetWorker.mockReturnValue(async () => { order.push("password-reset-worker"); });
    runtime.startBookingDispatcher.mockReturnValue(() => order.push("booking-dispatcher"));
    runtime.startMessagingDispatcher.mockReturnValue(() => order.push("messaging-dispatcher"));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn(async () => { order.push("sockets"); }) });
    runtime.startEventBus.mockRejectedValue(new Error("listener unavailable"));
    runtime.disconnect.mockImplementation(async () => { order.push("prisma"); });
    const server = fakeServer(order);

    await expect(startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never }))
      .rejects.toThrow("listener unavailable");

    expect(server.listen).not.toHaveBeenCalled();
    expect(order).toEqual(["booking-dispatcher", "messaging-dispatcher", "sockets", "prisma"]);
  });

  it("rejects an asynchronous HTTP bind error and cleans every started resource exactly once", async () => {
    const order: string[] = [];
    runtime.startPasswordResetWorker.mockReturnValue(async () => { order.push("password-reset-worker"); });
    const bindError = Object.assign(new Error("address in use"), { code: "EADDRINUSE" });
    runtime.startBookingDispatcher.mockReturnValue(vi.fn(async () => { order.push("booking-dispatcher"); }));
    runtime.startMessagingDispatcher.mockReturnValue(vi.fn(async () => { order.push("messaging-dispatcher"); }));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn(async () => { order.push("sockets"); }) });
    runtime.startEventBus.mockResolvedValue(async () => { order.push("event-bus"); });
    runtime.disconnect.mockImplementation(async () => { order.push("prisma"); });
    const server = fakeServer(order, bindError);

    await expect(startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never }))
      .rejects.toBe(bindError);

    expect(order).toEqual([
      "http:start",
      "booking-dispatcher",
      "messaging-dispatcher",
      "sockets",
      "event-bus",
      "http:stop",
      "prisma"
    ]);
    expect(runtime.disconnect).toHaveBeenCalledOnce();
    expect(server.listenerCount("error")).toBe(0);
    expect(server.listenerCount("listening")).toBe(0);
  });

  it("does not disconnect Prisma until asynchronous messaging shutdown work settles", async () => {
    const order: string[] = [];
    runtime.startPasswordResetWorker.mockReturnValue(async () => { order.push("password-reset-worker"); });
    let resolveDispatcher: (() => void) | undefined;
    let resolveGateway: (() => void) | undefined;
    runtime.startBookingDispatcher.mockReturnValue(vi.fn(() => { order.push("booking-dispatcher"); }));
    runtime.startMessagingDispatcher.mockReturnValue(vi.fn(() => new Promise<void>((resolve) => {
      order.push("messaging-dispatcher");
      resolveDispatcher = resolve;
    })));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn(() => new Promise<void>((resolve) => {
      order.push("sockets");
      resolveGateway = resolve;
    })) });
    runtime.startEventBus.mockResolvedValue(async () => { order.push("event-bus"); });
    runtime.disconnect.mockImplementation(async () => { order.push("prisma"); });
    const server = fakeServer(order);
    const result = await startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never });

    const shuttingDown = result.shutdown();
    await vi.waitFor(() => expect(order).toContain("messaging-dispatcher"));
    expect(order).toEqual(["http:start", "booking-dispatcher", "messaging-dispatcher"]);
    expect(runtime.disconnect).not.toHaveBeenCalled();

    resolveDispatcher?.();
    await vi.waitFor(() => expect(order).toContain("sockets"));
    expect(runtime.disconnect).not.toHaveBeenCalled();

    resolveGateway?.();
    await shuttingDown;
    expect(order).toEqual([
      "http:start",
      "booking-dispatcher",
      "messaging-dispatcher",
      "sockets",
      "event-bus",
      "http:stop",
      "password-reset-worker",
      "prisma"
    ]);
  });

  it("continues ordered resource cleanup after an earlier shutdown step fails", async () => {
    const order: string[] = [];
    runtime.startPasswordResetWorker.mockReturnValue(async () => { order.push("password-reset-worker"); });
    runtime.startBookingDispatcher.mockReturnValue(() => order.push("booking-dispatcher"));
    runtime.startMessagingDispatcher.mockReturnValue(() => order.push("messaging-dispatcher"));
    runtime.attachGateway.mockReturnValue({ io: {}, stop: vi.fn(async () => {
      order.push("sockets");
      throw new Error("socket stop failed");
    }) });
    runtime.startEventBus.mockResolvedValue(async () => { order.push("event-bus"); });
    runtime.disconnect.mockImplementation(async () => { order.push("prisma"); });
    const server = fakeServer(order);
    const result = await startBookingServer({ processTarget: new EventEmitter(), createHttpServer: () => server as never });

    await expect(result.shutdown()).rejects.toThrow("socket stop failed");

    expect(order).toEqual([
      "http:start",
      "booking-dispatcher",
      "messaging-dispatcher",
      "sockets",
      "event-bus",
      "http:stop",
      "password-reset-worker",
      "prisma"
    ]);
  });
});
