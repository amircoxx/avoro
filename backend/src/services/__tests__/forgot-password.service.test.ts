import { beforeEach, expect, it, vi } from "vitest";
import { requestPasswordReset } from "../forgot-password.service";
import { createPasswordResetRequest } from "../../models/password-reset-request.model";
import { consumePasswordResetIpLimit } from "../../models/password-reset-ip-limit.model";

vi.mock("../../models/password-reset-request.model", () => ({ createPasswordResetRequest: vi.fn() }));
vi.mock("../../models/password-reset-ip-limit.model", () => ({ consumePasswordResetIpLimit: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it("queues an allowed request after checking its IP", async () => {
  vi.mocked(consumePasswordResetIpLimit).mockResolvedValue(0);
  await requestPasswordReset("user@example.com", "::ffff:192.0.2.1");
  expect(consumePasswordResetIpLimit).toHaveBeenCalledWith("192.0.2.1");
  expect(createPasswordResetRequest).toHaveBeenCalledWith("user@example.com");
});

it("blocks an exhausted IP before queuing any email", async () => {
  vi.mocked(consumePasswordResetIpLimit).mockResolvedValue(123);
  await expect(requestPasswordReset("user@example.com", "192.0.2.1")).rejects.toMatchObject({
    status: 429, code: "rate_limited", details: { retryAfterSeconds: 123 }
  });
  expect(createPasswordResetRequest).not.toHaveBeenCalled();
});

it("fails closed when no client IP is available", async () => {
  await expect(requestPasswordReset("user@example.com", undefined)).rejects.toMatchObject({ status: 503 });
  expect(createPasswordResetRequest).not.toHaveBeenCalled();
});
