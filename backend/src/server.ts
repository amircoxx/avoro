/** Starts the HTTP server and owns booking email, messaging, socket, and database shutdown. */
import { createServer as createNodeHttpServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./models/database.model";
import { attachMessagingGateway, type MessagingEventSource } from "./realtime/messaging.gateway";
import { startMessagingEventBus, type MessagingBusEvent } from "./realtime/messaging-event-bus";
import { startOutboxDispatcher } from "./services/email/outbox-dispatcher";
import { startMessagingDeliveryDispatcher } from "./services/messaging/messaging-delivery-dispatcher";
import { startPasswordResetWorker } from "./services/email/password-reset-worker";

type ProcessTarget = {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
};

type StartBookingServerOptions = {
  processTarget?: ProcessTarget;
  createHttpServer?: typeof createNodeHttpServer;
};

type MessagingRuntime = {
  stopSockets(): Promise<void>;
  stopEventBus(): Promise<void>;
};

export async function startBookingServer(options: StartBookingServerOptions = {}) {
  const passwordResetConfigured = Boolean(env.BREVO_API_KEY && env.BOOKING_EMAIL_FROM && env.APP_PUBLIC_URL);
  if (passwordResetConfigured) new URL("/reset-password", env.APP_PUBLIC_URL);
  const processTarget = options.processTarget ?? process;
  const createHttpServer = options.createHttpServer ?? createNodeHttpServer;
  const sender = env.BOOKING_EMAIL_FROM && env.BOOKING_EMAIL_FROM_NAME
    ? { email: env.BOOKING_EMAIL_FROM, name: env.BOOKING_EMAIL_FROM_NAME }
    : undefined;
  const server = createHttpServer(app);
  const stopBookingDispatcher = startOutboxDispatcher({
    apiKey: env.BREVO_API_KEY,
    sender,
    appPublicUrl: env.APP_PUBLIC_URL
  });
  const stopMessagingDispatcher = startMessagingDeliveryDispatcher({
    apiKey: env.BREVO_API_KEY,
    sender,
    appPublicUrl: env.APP_PUBLIC_URL,
    enabled: env.MESSAGING_ENABLED
  });
  let messagingRuntime: MessagingRuntime | undefined;
  let httpListenAttempted = false;
  let stopPasswordResetWorker: ReturnType<typeof startPasswordResetWorker> | undefined;


  try {
    messagingRuntime = await startMessagingRuntime({
      server,
      enabled: env.MESSAGING_ENABLED,
      onAttached: (runtime) => { messagingRuntime = runtime; }
    });
    httpListenAttempted = true;
    await listenServer(server, env.PORT);
    if (passwordResetConfigured) {
      stopPasswordResetWorker = startPasswordResetWorker();
    } else {
      console.warn("Password reset email worker disabled: email configuration is missing");
    }
    console.log(`API listening on ${env.PORT}`);
  } catch (error) {
    await runShutdownSteps([
      async () => { stopBookingDispatcher(); },
      async () => { await stopMessagingDispatcher(); },
      async () => { await messagingRuntime?.stopSockets(); },
      async () => { await messagingRuntime?.stopEventBus(); },
      async () => { if (httpListenAttempted) await closeServer(server); },
      async () => { await stopPasswordResetWorker?.(); },
      async () => { await prisma.$disconnect(); }
    ]).catch(() => undefined);
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    processTarget.off("SIGINT", onSignal);
    processTarget.off("SIGTERM", onSignal);
    await runShutdownSteps([
      async () => { stopBookingDispatcher(); },
      async () => { await stopMessagingDispatcher(); },
      async () => { await messagingRuntime!.stopSockets(); },
      async () => { await messagingRuntime!.stopEventBus(); },
      async () => { await closeServer(server); },
      async () => { await stopPasswordResetWorker?.(); },
      async () => { await prisma.$disconnect(); }
    ]);
  };
  const onSignal = () => {
    void shutdown().catch(() => {
      console.error("Server shutdown failed");
    });
  };
  processTarget.once("SIGINT", onSignal);
  processTarget.once("SIGTERM", onSignal);

  return { server, shutdown };
}

async function startMessagingRuntime({
  server,
  enabled,
  onAttached
}: {
  server: Server;
  enabled: boolean;
  onAttached(runtime: MessagingRuntime): void;
}): Promise<MessagingRuntime> {
  const hub = createMessagingEventHub();
  const gateway = attachMessagingGateway({
    server,
    eventBus: hub.source,
    frontendOrigin: env.FRONTEND_ORIGIN,
    enabled
  });
  const attachedRuntime = { stopSockets: () => gateway.stop(), stopEventBus: async () => undefined };
  onAttached(attachedRuntime);
  if (!enabled) {
    return attachedRuntime;
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when messaging is enabled");
  }
  const stopEventBus = await startMessagingEventBus({
    connectionString: env.DATABASE_URL,
    onEvent: (event) => hub.publish(event)
  });
  return { stopSockets: () => gateway.stop(), stopEventBus };
}

function createMessagingEventHub() {
  const listeners = new Set<(event: MessagingBusEvent) => void | Promise<void>>();
  const source: MessagingEventSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return {
    source,
    async publish(event: MessagingBusEvent) {
      await Promise.all([...listeners].map((listener) => listener(event)));
    }
  };
}

function closeServer(server: Pick<Server, "close">) {
  return new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
}

function listenServer(server: Pick<Server, "listen" | "once" | "off">, port: number) {
  return new Promise<void>((resolvePromise, reject) => {
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    const onListening = () => {
      cleanup();
      resolvePromise();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
    try {
      server.listen(port);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function runShutdownSteps(steps: Array<() => Promise<void>>) {
  let firstError: unknown;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}

const entryPath = process.argv[1];
if (entryPath && pathToFileURL(resolve(entryPath)).href === import.meta.url) {
  void startBookingServer().catch(() => {
    console.error("Server startup failed");
    process.exitCode = 1;
  });
}
