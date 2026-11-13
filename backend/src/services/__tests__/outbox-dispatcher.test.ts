import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrevoEmailClient, BrevoEmailError } from "../email/brevo.client";
import {
  dispatchOutboxBatch,
  startOutboxDispatcher,
  type ClaimedOutboxRow,
  type OutboxDatabase
} from "../email/outbox-dispatcher";

const now = new Date("2026-07-20T12:00:00.000Z");

function row(overrides: Partial<ClaimedOutboxRow> = {}): ClaimedOutboxRow {
  return {
    id: "outbox-1",
    messageKind: "BOOKING_CONFIRMED",
    recipientEmail: "jordan@example.com",
    recipientName: "Jordan",
    payload: {
      bookingId: "booking-1",
      customerName: "Jordan",
      techName: "Maya",
      serviceName: "Gel-X Full Set",
      startAt: "2026-07-21T14:00:00.000Z",
      endAt: "2026-07-21T15:30:00.000Z",
      timeZone: "America/New_York",
      durationMinutes: 90,
      startingPriceCents: 8500,
      cancellationCutoffMinutes: 120,
      recipientRole: "CUSTOMER"
    },
    attempts: 1,
    leasedAt: now,
    ...overrides
  };
}

function database(rows: ClaimedOutboxRow[] = [row()]) {
  const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    notificationOutbox: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  } as unknown as OutboxDatabase;
  return { db, tx };
}

const config = {
  apiKey: "secret-api-key",
  sender: { email: "bookings@example.com", name: "Find My Tech" },
  appPublicUrl: "https://findmytech.example"
};

describe("BrevoEmailClient", () => {
  it("posts the exact transactional-email request and parses messageId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "  brevo-1  " }), {
      status: 201,
      headers: { "content-type": "application/json" }
    }));
    const client = new BrevoEmailClient("secret-api-key", fetchImpl);
    const message = {
      sender: { email: "bookings@example.com", name: "Find My Tech" },
      to: [{ email: "jordan@example.com", name: "Jordan" }],
      subject: "Booking confirmed",
      htmlContent: "<p>Confirmed</p>",
      textContent: "Confirmed"
    };

    await expect(client.send(message)).resolves.toEqual({ messageId: "brevo-1" });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": "secret-api-key",
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(message),
      signal: expect.any(AbortSignal)
    });
  });

  it("forwards caller cancellation and classifies an abort as sanitized retryable failure", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(Object.assign(new Error("secret request body"), { name: "AbortError" })), { once: true });
        });
      });
      const caller = new AbortController();
      const client = new BrevoEmailClient("secret-api-key", fetchImpl);
      const sending = client.send(emailMessage(), { signal: caller.signal });
      await Promise.resolve();

      expect(requestSignal).toBeInstanceOf(AbortSignal);
      caller.abort();
      await expect(sending).rejects.toMatchObject({
        message: "Brevo email request timed out or was aborted",
        status: undefined,
        retryable: true
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the timeout active while reading the provider response body", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => new Promise((_resolve, reject) => {
            requestSignal?.addEventListener("abort", () => reject(Object.assign(new Error("provider body"), { name: "AbortError" })), { once: true });
          })
        } as Response);
      });
      const sending = new BrevoEmailClient("secret-api-key", fetchImpl).send(emailMessage());
      for (let attempt = 0; attempt < 5 && !requestSignal; attempt += 1) await Promise.resolve();
      const rejected = expect(sending).rejects.toMatchObject({
        message: "Brevo email request timed out or was aborted",
        retryable: true
      });

      await vi.advanceTimersByTimeAsync(45_000);
      expect(requestSignal?.aborted).toBe(true);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a whitespace-only provider message ID", async () => {
    const client = new BrevoEmailClient("secret-api-key", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "   " }), { status: 201 })
    ));

    await expect(client.send({
      sender: config.sender,
      to: [{ email: "jordan@example.com" }],
      subject: "subject",
      htmlContent: "html",
      textContent: "text"
    })).rejects.toMatchObject({ message: "Brevo email response was invalid", retryable: false });
  });

  it("throws sanitized retry metadata without exposing the key or provider body", async () => {
    const providerBody = "private provider diagnostics";
    const client = new BrevoEmailClient("secret-api-key", vi.fn().mockResolvedValue(new Response(providerBody, { status: 429 })));
    await expect(client.send({
      sender: config.sender,
      to: [{ email: "jordan@example.com" }],
      subject: "subject",
      htmlContent: "html",
      textContent: "text"
    })).rejects.toMatchObject({ message: "Brevo email request failed with status 429", status: 429, retryable: true });
    await client.send({
      sender: config.sender,
      to: [{ email: "jordan@example.com" }],
      subject: "subject",
      htmlContent: "html",
      textContent: "text"
    }).catch((error: Error) => {
      expect(error.message).not.toContain("secret-api-key");
      expect(error.message).not.toContain(providerBody);
    });
  });
});

describe("dispatchOutboxBatch", () => {
  it.each(["CUSTOMER", "TECH"])("dispatches a rescheduling email for %s with previous and current times", async (recipientRole) => {
    const original = row();
    const { db } = database([row({
      messageKind: "BOOKING_RESCHEDULED",
      payload: {
        ...(original.payload as Record<string, unknown>), recipientRole,
        oldStartAt: "2026-07-20T14:00:00Z"
      }
    })]);
    const send = vi.fn().mockResolvedValue({ messageId: "rescheduled-1" });
    await dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now });
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      subject: "Booking rescheduled: Gel-X Full Set",
      textContent: expect.stringContaining("Previous date and time: Monday, July 20, 2026 at 10:00 AM EDT"),
      htmlContent: expect.stringContaining("Date and time: Tuesday, July 21, 2026 at 10:00 AM EDT")
    }));
    expect(send.mock.calls[0][0].textContent).toContain(
      `https://findmytech.example/${recipientRole === "TECH" ? "schedule" : "bookings"}`
    );
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sentAt: now, brevoMessageId: "rescheduled-1" })
    }));
  });

  it.each([undefined, null, 123, "not-a-date"])("does not send rescheduling email with invalid previous start %s", async (oldStartAt) => {
    const { db } = database([row({
      messageKind: "BOOKING_RESCHEDULED",
      payload: { ...(row().payload as Record<string, unknown>), oldStartAt }
    })]);
    const send = vi.fn();
    await dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now });
    expect(send).not.toHaveBeenCalled();
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { leasedAt: null, nextAttemptAt: null, lastError: "Email delivery failed" }
    }));
  });

  it("claims at most 20 due rows with SKIP LOCKED and a 60-second expired-lease boundary", async () => {
    const { db, tx } = database([]);
    await dispatchOutboxBatch({ database: db, client: { send: vi.fn() }, ...config, now: () => now });

    const sql = tx.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    const query = sql.strings.join("?");
    expect(query).toContain("FOR UPDATE SKIP LOCKED");
    expect(query).toContain("LIMIT 20");
    expect(query).toContain("leasedAt");
    expect(sql.values).toContainEqual(new Date(now.getTime() - 60_000));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("never reclaims an eighth-attempt row after a crashed lease expires", async () => {
    const { db, tx } = database([]);
    const send = vi.fn();

    await dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now });

    const sql = tx.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join("?")).toContain('"attempts" < 8');
    expect(sql.values).toContainEqual(new Date(now.getTime() - 60_000));
    expect(send).not.toHaveBeenCalled();
  });

  it("sends outside the claim transaction and stores the provider message ID", async () => {
    const { db } = database();
    let transactionFinished = false;
    const transactionMock = db.$transaction as unknown as ReturnType<typeof vi.fn>;
    transactionMock.mockImplementationOnce(async (callback: (client: { $queryRaw: () => Promise<ClaimedOutboxRow[]> }) => Promise<ClaimedOutboxRow[]>) => {
      const result = await callback({
        $queryRaw: vi.fn().mockResolvedValue([row()])
      });
      transactionFinished = true;
      return result;
    });
    const send = vi.fn(async () => {
      expect(transactionFinished).toBe(true);
      return { messageId: "brevo-message-1" };
    });

    await expect(dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now })).resolves.toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      sender: config.sender,
      to: [{ email: "jordan@example.com", name: "Jordan" }]
    }));
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: "outbox-1", leasedAt: now, sentAt: null },
      data: {
        sentAt: now,
        leasedAt: null,
        nextAttemptAt: null,
        brevoMessageId: "brevo-message-1",
        lastError: null
      }
    });
  });

  it("starts every claimed send without waiting for a slow failing row and completes the batch", async () => {
    const rows = [
      row({ id: "outbox-1", recipientEmail: "first@example.com" }),
      row({ id: "outbox-2", recipientEmail: "second@example.com" }),
      row({ id: "outbox-3", recipientEmail: "third@example.com" })
    ];
    const { db } = database(rows);
    const first = deferred<{ messageId: string }>();
    const send = vi.fn((message: { to: Array<{ email: string }> }) => {
      if (message.to[0]?.email === "first@example.com") return first.promise;
      return Promise.resolve({ messageId: `sent-${message.to[0]?.email}` });
    });
    const dispatch = dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now });

    try {
      for (let attempt = 0; attempt < 8 && send.mock.calls.length < 3; attempt += 1) await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(3);
      await vi.waitFor(() => {
        expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: "outbox-2", leasedAt: now, sentAt: null }
        }));
        expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: "outbox-3", leasedAt: now, sentAt: null }
        }));
      });
    } finally {
      first.reject(new BrevoEmailError("first provider request failed", undefined, true));
      await dispatch;
    }

    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "outbox-1", leasedAt: now, sentAt: null },
      data: expect.objectContaining({ lastError: "first provider request failed" })
    }));
  });

  it("finishes every slow claimed send before the shared lease expires so a second worker cannot duplicate one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const rows = [
      row({ id: "outbox-1", recipientEmail: "first@example.com" }),
      row({ id: "outbox-2", recipientEmail: "second@example.com" })
    ];
    const { db } = leaseAwareDatabase(rows);
    const starts: number[] = [];
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      starts.push(Date.now());
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "AbortError" })), { once: true });
      });
    });
    const firstDispatch = dispatchOutboxBatch({
      database: db,
      client: new BrevoEmailClient(config.apiKey, fetchImpl),
      ...config,
      now: () => new Date(Date.now())
    });
    let firstSettled = false;
    void firstDispatch.then(() => { firstSettled = true; });
    const secondWorkerSend = vi.fn().mockResolvedValue({ messageId: "duplicate" });

    try {
      for (let attempt = 0; attempt < 8 && fetchImpl.mock.calls.length < 2; attempt += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(45_000);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);

      await expect(dispatchOutboxBatch({
        database: db,
        client: { send: secondWorkerSend },
        ...config,
        now: () => new Date(Date.now())
      })).resolves.toBe(0);
      expect(starts).toEqual([now.getTime(), now.getTime()]);
      expect(firstSettled).toBe(true);
      expect(secondWorkerSend).not.toHaveBeenCalled();
      await expect(firstDispatch).resolves.toBe(2);
    } finally {
      await vi.runAllTimersAsync();
      await firstDispatch;
      vi.useRealTimers();
    }
  });

  it("aborts a pending Brevo request at 45 seconds, before lease expiry, and schedules a retry", async () => {
    vi.useFakeTimers();
    try {
      const { db } = database();
      let requestSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(Object.assign(new Error("provider body and secret-api-key"), { name: "AbortError" })), { once: true });
        });
      });
      const dispatch = dispatchOutboxBatch({
        database: db,
        client: new BrevoEmailClient(config.apiKey, fetchImpl),
        ...config,
        now: () => now
      });
      for (let attempt = 0; attempt < 5 && !requestSignal; attempt += 1) await Promise.resolve();

      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(44_999);
      expect(requestSignal?.aborted).toBe(false);
      expect(db.notificationOutbox.updateMany).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(dispatch).resolves.toBe(1);

      expect(requestSignal?.aborted).toBe(true);
      expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith({
        where: { id: "outbox-1", leasedAt: now, sentAt: null },
        data: {
          leasedAt: null,
          nextAttemptAt: new Date("2026-07-20T12:02:00.000Z"),
          lastError: "Brevo email request timed out or was aborted"
        }
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the lease for at-least-once reclaim when persisting Brevo success fails", async () => {
    const { db } = database();
    const persistenceError = new Error("database unavailable");
    vi.mocked(db.notificationOutbox.updateMany).mockRejectedValueOnce(persistenceError);
    const send = vi.fn().mockResolvedValue({ messageId: "brevo-message-1" });

    await expect(dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now }))
      .rejects.toBe(persistenceError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, "network"],
    [408, "status 408"],
    [429, "status 429"],
    [500, "status 500"]
  ])("retries transient failure %s with bounded exponential backoff", async (status, label) => {
    const { db } = database([row({ attempts: 3 })]);
    const error = new BrevoEmailError(`Brevo email request failed ${label}`, status, true);

    await dispatchOutboxBatch({ database: db, client: { send: vi.fn().mockRejectedValue(error) }, ...config, now: () => now });
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: "outbox-1", leasedAt: now, sentAt: null },
      data: {
        leasedAt: null,
        nextAttemptAt: new Date("2026-07-20T12:08:00.000Z"),
        lastError: expect.stringContaining(label)
      }
    });
  });

  it("caps retry delay at 60 minutes", async () => {
    const { db } = database([row({ attempts: 7 })]);
    await dispatchOutboxBatch({
      database: db,
      client: { send: vi.fn().mockRejectedValue(new BrevoEmailError("network failure", undefined, true)) },
      ...config,
      now: () => now
    });
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nextAttemptAt: new Date("2026-07-20T13:00:00.000Z") })
    }));
  });

  it("marks non-retryable 4xx failures terminal", async () => {
    const { db } = database();
    await dispatchOutboxBatch({
      database: db,
      client: { send: vi.fn().mockRejectedValue(new BrevoEmailError("Brevo email request failed with status 400", 400, false)) },
      ...config,
      now: () => now
    });
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: "outbox-1", leasedAt: now, sentAt: null },
      data: { leasedAt: null, nextAttemptAt: null, lastError: "Brevo email request failed with status 400" }
    });
  });

  it("marks the eighth failed attempt terminal even when retryable", async () => {
    const { db } = database([row({ attempts: 8 })]);
    await dispatchOutboxBatch({
      database: db,
      client: { send: vi.fn().mockRejectedValue(new BrevoEmailError("network failure", undefined, true)) },
      ...config,
      now: () => now
    });
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { leasedAt: null, nextAttemptAt: null, lastError: "network failure" }
    }));
  });

  it("sanitizes arbitrary errors before persistence", async () => {
    const { db } = database();
    await dispatchOutboxBatch({
      database: db,
      client: { send: vi.fn().mockRejectedValue(new Error("secret-api-key private provider diagnostics")) },
      ...config,
      now: () => now
    });
    const update = vi.mocked(db.notificationOutbox.updateMany).mock.calls[0]?.[0];
    expect(JSON.stringify(update)).not.toContain("secret-api-key");
    expect(JSON.stringify(update)).not.toContain("private provider diagnostics");
    expect(update).toEqual(expect.objectContaining({ data: expect.objectContaining({ lastError: "Email delivery failed" }) }));
  });

  it("terminalizes an unknown message kind without contacting Brevo", async () => {
    const { db } = database([row({ messageKind: "PASSWORD_RESET" })]);
    const send = vi.fn();

    await dispatchOutboxBatch({ database: db, client: { send }, ...config, now: () => now });

    expect(send).not.toHaveBeenCalled();
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: "outbox-1", leasedAt: now, sentAt: null },
      data: { leasedAt: null, nextAttemptAt: null, lastError: "Email delivery failed" }
    });
  });
});

function emailMessage() {
  return {
    sender: config.sender,
    to: [{ email: "jordan@example.com" }],
    subject: "subject",
    htmlContent: "html",
    textContent: "text"
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

function leaseAwareDatabase(rows: ClaimedOutboxRow[]) {
  type State = ClaimedOutboxRow & { sentAt: Date | null; nextAttemptAt: Date | null; brevoMessageId?: string; lastError: string | null };
  const state = new Map(rows.map((item) => [item.id, {
    ...item,
    sentAt: null,
    nextAttemptAt: item.leasedAt,
    lastError: null
  } satisfies State]));
  let claimCount = 0;
  const tx = {
    $queryRaw: vi.fn(async (sql: { values: unknown[] }) => {
      claimCount += 1;
      if (claimCount === 1) return rows;
      const currentTime = sql.values[0] as Date;
      const leaseExpiredBefore = sql.values[1] as Date;
      const due = [...state.values()].filter((item) => item.sentAt === null
        && item.nextAttemptAt !== null
        && item.nextAttemptAt <= currentTime
        && item.attempts < 8
        && (item.leasedAt === null || item.leasedAt <= leaseExpiredBefore));
      for (const item of due) {
        item.leasedAt = currentTime;
        item.attempts += 1;
      }
      return due;
    })
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    notificationOutbox: {
      updateMany: vi.fn(async (args: {
        where: { id: string; leasedAt: Date; sentAt: null };
        data: { sentAt?: Date; leasedAt: null; nextAttemptAt: Date | null; brevoMessageId?: string; lastError: string | null };
      }) => {
        const item = state.get(args.where.id);
        if (!item || item.sentAt !== null || item.leasedAt?.getTime() !== args.where.leasedAt.getTime()) return { count: 0 };
        Object.assign(item, args.data);
        return { count: 1 };
      })
    }
  } as unknown as OutboxDatabase;
  return { db, state };
}

describe("startOutboxDispatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("logs missing configuration once, leaves rows pending, and creates no timer", async () => {
    const dispatch = vi.fn();
    const warn = vi.fn();
    const stop = startOutboxDispatcher({ dispatch, logger: { warn, error: vi.fn() }, pollIntervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(3_000);
    stop();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not overlap polls and stop clears the timer without rescheduling", async () => {
    let resolveDispatch: (() => void) | undefined;
    const dispatch = vi.fn(() => new Promise<void>((resolve) => { resolveDispatch = resolve; }));
    const stop = startOutboxDispatcher({
      dispatch,
      logger: { warn: vi.fn(), error: vi.fn() },
      pollIntervalMs: 1_000,
      apiKey: config.apiKey,
      sender: config.sender,
      appPublicUrl: config.appPublicUrl
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    stop();
    resolveDispatch?.();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
