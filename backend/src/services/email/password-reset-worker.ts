import { prisma } from "../../models/database.model";
import { randomBytes, createHash } from "node:crypto";
import { createPasswordResetToken } from "../../models/password-reset.model";
import { claimPasswordResetRequest, completePasswordResetRequest, retryPasswordResetRequest, failPasswordResetRequest, PASSWORD_RESET_MAX_ATTEMPTS, markPasswordResetRequestSendStarted } from "../../models/password-reset-request.model";
import { BrevoEmailClient, BrevoEmailError } from "./brevo.client";
import { env } from "../../config/env";

export async function processPasswordResetEmail(email: string, requestId: string, claimId: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return true; // Do not reveal whether the email exists in the system
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  await createPasswordResetToken(user.id, tokenHash, expiresAt);


  // Send the password reset email using Brevo
  const { BREVO_API_KEY, BOOKING_EMAIL_FROM, APP_PUBLIC_URL } = env;

  if (!BREVO_API_KEY || !BOOKING_EMAIL_FROM || !APP_PUBLIC_URL) {
    throw new Error("Password reset email configuration is missing");
  }

  const client = new BrevoEmailClient(BREVO_API_KEY);

  const resetLink = new URL("/reset-password", APP_PUBLIC_URL);
  resetLink.searchParams.set("token", token);
  const link = resetLink.toString();
  const htmlLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const canSend = await markPasswordResetRequestSendStarted(requestId, claimId);
  if (!canSend) {
    return false;
  }
  await client.send({
    sender: {
      email: BOOKING_EMAIL_FROM,
      name: env.BOOKING_EMAIL_FROM_NAME ?? "Find My Tech"
    },
    to: [{ email }],
    subject: "Reset your password",
    htmlContent: `
            <p>We received a request to reset your password.</p>
            <p><a href="${htmlLink}">Reset your password</a></p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn’t request this, you can ignore this email.</p>
    `,
    textContent:
      `Reset your password: ${link}\n\n` +
      "This link expires in 1 hour.\n" +
      "If you didn’t request this, you can ignore this email."
  });
  return true;
}

export async function processNextPasswordResetRequest() {
  if (!env.BREVO_API_KEY || !env.BOOKING_EMAIL_FROM || !env.APP_PUBLIC_URL) {
    throw new Error("Password reset email configuration is missing");
  }

  const request = await claimPasswordResetRequest();
  if (!request) return "idle";

  try {
    const processed = await processPasswordResetEmail(request.email, request.id, request.claimId);
    if (!processed) return "claim_lost";
  } catch (error) {
    const shouldRetry =
      error instanceof BrevoEmailError &&
      error.status === 429 &&
      request.attempts < PASSWORD_RESET_MAX_ATTEMPTS;

    if (shouldRetry) {
      const delayMs = 60_000 * 2 ** (request.attempts - 1);
      const availableAt = new Date(Date.now() + delayMs);

      const retried = await retryPasswordResetRequest(
        request.id,
        request.claimId,
        availableAt
      );

      return retried ? "retry_scheduled" : "claim_lost";
    }

    const failed = await failPasswordResetRequest(
      request.id,
      request.claimId
    );

    return failed ? "failed" : "claim_lost";
  }

  const completed = await completePasswordResetRequest(
    request.id,
    request.claimId
  );

  return completed ? "completed" : "claim_lost";
}

export function startPasswordResetWorker() {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> = Promise.resolve();

    async function tick() {
        try {
            const result = await processNextPasswordResetRequest();
            if (result === "failed" || result === "claim_lost") {
                console.warn("Password reset worker outcome: ", result);
            }

        } catch {
            console.error("Password reset worker processing failed");
        } finally {
            if (!stopped) {
                timer = setTimeout(() => {
                    running = tick();
                }, 1_000);
            }
        }
    }
    running = tick();

    return async function stopPasswordResetWorker() {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
        }
        await running;
    };
}