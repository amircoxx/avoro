import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { processNextPasswordResetRequest, startPasswordResetWorker } from "../email/password-reset-worker";
import { BrevoEmailClient, BrevoEmailError } from "../email/brevo.client";
import {
  claimPasswordResetRequest,
  completePasswordResetRequest,
  markPasswordResetRequestSendStarted,
  retryPasswordResetRequest,
  failPasswordResetRequest
} from "../../models/password-reset-request.model";
import { prisma } from "../../models/database.model";
import { createPasswordResetToken } from "../../models/password-reset.model";
// Supply fake configuration without loading .env.local.
vi.mock("../../config/env", () => ({
  env: {
    BREVO_API_KEY: "test-key",
    BOOKING_EMAIL_FROM: "sender@example.com",
    BOOKING_EMAIL_FROM_NAME: "Test App",
    APP_PUBLIC_URL: "https://example.com"
  }
}));

// Replace database access.
vi.mock("../../models/database.model", () => ({
  prisma: {
    user: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock("../../models/password-reset.model", () => ({
  createPasswordResetToken: vi.fn()
}));

vi.mock("../../models/password-reset-request.model", () => ({
  claimPasswordResetRequest: vi.fn(),
  completePasswordResetRequest: vi.fn(),
  retryPasswordResetRequest: vi.fn(),
  failPasswordResetRequest: vi.fn(),
  markPasswordResetRequestSendStarted: vi.fn(),
  PASSWORD_RESET_MAX_ATTEMPTS: 3
}));

// Shared successful setup for the failure and lifecycle checks below.
function arrangeClaimedRequest() {
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "00000000-0000-4000-8000-000000000001",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(true);
  vi.mocked(completePasswordResetRequest).mockResolvedValue(true);

  return vi.spyOn(BrevoEmailClient.prototype, "send")
    .mockResolvedValue({ messageId: "test-message" });
}

// A manually resolved Promise lets a test hold email delivery in progress.
function pendingEmail() {
  let resolve!: (value: { messageId: string }) => void;
  const promise = new Promise<{ messageId: string }>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, finish: () => resolve({ messageId: "test-message" }) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it("propagates completion-write failure without resending or scheduling a retry", async () => {
  const send = arrangeClaimedRequest();
  const databaseError = new Error("Completion write failed");
  vi.mocked(completePasswordResetRequest).mockRejectedValue(databaseError);

  await expect(processNextPasswordResetRequest()).rejects.toBe(databaseError);

  expect(send).toHaveBeenCalledOnce();
  expect(completePasswordResetRequest).toHaveBeenCalledExactlyOnceWith(
    "request-1", "00000000-0000-4000-8000-000000000001"
  );
  expect(retryPasswordResetRequest).not.toHaveBeenCalled();
  expect(failPasswordResetRequest).not.toHaveBeenCalled();
});

it("waits for the active cycle before scheduling the next poll", async () => {
  vi.useFakeTimers();
  const send = arrangeClaimedRequest();
  const email = pendingEmail();
  send.mockReturnValueOnce(email.promise);
  const stop = startPasswordResetWorker();

  try {
    // Even after several polling intervals, the first send is still pending.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send).toHaveBeenCalledOnce();
    expect(claimPasswordResetRequest).toHaveBeenCalledOnce();
    expect(completePasswordResetRequest).not.toHaveBeenCalled();

    // End that cycle and make the next poll find an empty queue.
    vi.mocked(claimPasswordResetRequest).mockResolvedValue(null);
    email.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(completePasswordResetRequest).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(999);
    expect(claimPasswordResetRequest).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(claimPasswordResetRequest).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
  } finally {
    email.finish();
    await stop();
  }

  // Stopping also cancels the next timer already scheduled by the idle cycle.
  await vi.advanceTimersByTimeAsync(5_000);
  expect(claimPasswordResetRequest).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for in-flight work during shutdown and prevents future cycles", async () => {
  vi.useFakeTimers();
  const send = arrangeClaimedRequest();
  const email = pendingEmail();
  send.mockReturnValueOnce(email.promise);
  const stop = startPasswordResetWorker();
  const stopped = vi.fn();

  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledOnce();
    const stopping = stop().then(stopped);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(stopped).not.toHaveBeenCalled();
    expect(completePasswordResetRequest).not.toHaveBeenCalled();
    expect(claimPasswordResetRequest).toHaveBeenCalledOnce();

    email.finish();
    await stopping;
    expect(stopped).toHaveBeenCalledOnce();
    expect(completePasswordResetRequest).toHaveBeenCalledExactlyOnceWith(
      "request-1", "00000000-0000-4000-8000-000000000001"
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(claimPasswordResetRequest).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    email.finish();
    await stop();
  }
});

it("returns idle without sending email when no request is claimed", async () => {
  vi.mocked(claimPasswordResetRequest).mockResolvedValue(null);

  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockResolvedValue({ messageId: "test-message" });

  const result = await processNextPasswordResetRequest();

  expect(result).toBe("idle");
  expect(claimPasswordResetRequest).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  expect(completePasswordResetRequest).not.toHaveBeenCalled();
});

it("sends a reset email and completes the claimed request", async () => {
  // Arrange: pretend the worker claimed a queued request.
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });

  // Pretend the account exists.
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Pretend database writes succeed.
  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(true);
  vi.mocked(completePasswordResetRequest).mockResolvedValue(true);

  // Replace real email sending.
  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockResolvedValue({ messageId: "test-message" });

  // Act: run one worker cycle.
  const result = await processNextPasswordResetRequest();

  // Assert: check the outcome and important calls.
  expect(result).toBe("completed");

  expect(createPasswordResetToken).toHaveBeenCalledWith(
    "user-1",
    expect.stringMatching(/^[a-f0-9]{64}$/),
    expect.any(Date)
  );

  expect(markPasswordResetRequestSendStarted).toHaveBeenCalledWith(
    "request-1",
    "claim-1-2-3-4-5"
  );

  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: [{ email: "customer@example.com" }],
      subject: "Reset your password",
      textContent: expect.stringContaining(
        "https://example.com/reset-password?token="
      )
    })
  );

  // Check the actual emailed token against the hash passed to storage.
  const message = send.mock.calls[0][0];
  const link = message.textContent.match(/https:\/\/[^\s]+/)?.[0];
  expect(link).toBeDefined();
  const resetUrl = new URL(link!);
  expect(resetUrl.origin).toBe("https://example.com");
  expect(resetUrl.pathname).toBe("/reset-password");
  const token = resetUrl.searchParams.get("token");
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(createPasswordResetToken).toHaveBeenCalledOnce();
  const storedHash = vi.mocked(createPasswordResetToken).mock.calls[0][1];
  expect(storedHash).toBe(createHash("sha256").update(token!).digest("hex"));
  expect(storedHash).not.toBe(token);
  expect(message.htmlContent).toContain(resetUrl.toString());

  expect(completePasswordResetRequest).toHaveBeenCalledWith(
    "request-1",
    "claim-1-2-3-4-5"
  );
});

it ("does not send when the send checkpoint rejects the claim", async () => {
      // Arrange: pretend the worker claimed a queued request.
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });

  // Pretend the account exists.
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Pretend database writes succeed.
  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(false);

  // Replace real email sending.
  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockResolvedValue({ messageId: "test-message" });

  // Act: run one worker cycle.
  const result = await processNextPasswordResetRequest();

  // Assert: check the outcome and important calls.
  expect(result).toBe("claim_lost");
  expect(send).not.toHaveBeenCalled();
  expect(completePasswordResetRequest).not.toHaveBeenCalled();
});

it("schedules a retry when Brevo returns 429", async () => {
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(true);
  vi.mocked(retryPasswordResetRequest).mockResolvedValue(true);

  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockRejectedValue(
      new BrevoEmailError("Rate limited", 429, true)
    );

  const before = Date.now();
  const result = await processNextPasswordResetRequest();
  const after = Date.now();

  expect(result).toBe("retry_scheduled");
  expect(send).toHaveBeenCalledOnce();

  expect(retryPasswordResetRequest).toHaveBeenCalledOnce();
  expect(retryPasswordResetRequest).toHaveBeenCalledWith(
    "request-1",
    "claim-1-2-3-4-5",
    expect.any(Date)
  );

  const retryAt =
    vi.mocked(retryPasswordResetRequest).mock.calls[0][2];

  expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  expect(retryAt.getTime()).toBeLessThanOrEqual(after + 60_000);

  expect(completePasswordResetRequest).not.toHaveBeenCalled();
  expect(failPasswordResetRequest).not.toHaveBeenCalled();
});

it("marks the request failed when the attempt limit is reached", async () => {
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 3
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(true);
  vi.mocked(failPasswordResetRequest).mockResolvedValue(true);

  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockRejectedValue(
      new BrevoEmailError("Rate limited", 429, true)
    );

  const result = await processNextPasswordResetRequest();

  expect(result).toBe("failed");
  expect(send).toHaveBeenCalledOnce();

  expect(failPasswordResetRequest).toHaveBeenCalledOnce();
  expect(failPasswordResetRequest).toHaveBeenCalledWith(
    "request-1",
    "claim-1-2-3-4-5"
  );

    expect(retryPasswordResetRequest).not.toHaveBeenCalled();
    expect(completePasswordResetRequest).not.toHaveBeenCalled();
});

it ("does not retry when email delivery is uncertain", async () => {
    vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    email: "customer@example.com",
    passwordHash: null,
    role: "CUSTOMER",
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);
  vi.mocked(markPasswordResetRequestSendStarted).mockResolvedValue(true);
  vi.mocked(failPasswordResetRequest).mockResolvedValue(true);

  const send = vi
    .spyOn(BrevoEmailClient.prototype, "send")
    .mockRejectedValue(
      new BrevoEmailError("Request timed out", undefined, true)
    );

  const result = await processNextPasswordResetRequest();

  expect(result).toBe("failed");
  expect(send).toHaveBeenCalledOnce();

  expect(failPasswordResetRequest).toHaveBeenCalledOnce();
  expect(failPasswordResetRequest).toHaveBeenCalledWith(
    "request-1",
    "claim-1-2-3-4-5"
  );

    expect(retryPasswordResetRequest).not.toHaveBeenCalled();
    expect(completePasswordResetRequest).not.toHaveBeenCalled();

});

it ("does not send email when the user account is not found", async () => {
  vi.mocked(claimPasswordResetRequest).mockResolvedValue({
    id: "request-1",
    email: "customer@example.com",
    claimId: "claim-1-2-3-4-5",
    leaseUntil: new Date(Date.now() + 120_000),
    attempts: 1
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(completePasswordResetRequest).mockResolvedValue(true);

const send = vi
  .spyOn(BrevoEmailClient.prototype, "send")
  .mockResolvedValue({ messageId: "test-message" });

  const result = await processNextPasswordResetRequest();

    expect(result).toBe("completed");
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(markPasswordResetRequestSendStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(completePasswordResetRequest).toHaveBeenCalledWith(
        "request-1",
        "claim-1-2-3-4-5"
    );
    expect(retryPasswordResetRequest).not.toHaveBeenCalled();
    expect(failPasswordResetRequest).not.toHaveBeenCalled();
});
