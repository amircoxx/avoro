/** Connects account recovery UI callbacks to browser API operations. */
import {
  requestPasswordReset,
  resetPassword as sendResetPassword
} from "@/services/api/auth";
import { ApiClientError } from "@/services/api/client";

export type AccountRecoveryActions = {
  requestReset(email: string): Promise<void>;
  resetPassword(input: { token: string; newPassword: string }): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
};

export class AccountRecoveryError extends Error {
  constructor(public code: "expired" | "rate_limited" | "unavailable", public retryAfterSeconds = 60) {
    super(code);
    this.name = "AccountRecoveryError";
  }
}

async function unavailable(): Promise<void> {
  throw new AccountRecoveryError("unavailable");
}

/** Translate API errors into the recovery panel states. */
async function handleRecoveryRequest(
  operation: () => Promise<void>
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.code === "rate_limited") {
        const seconds = error.details?.retryAfterSeconds;

        throw new AccountRecoveryError(
          "rate_limited",
          typeof seconds === "number" ? seconds : 60
        );
      }

      if (error.code === "invalid_reset_token") {
        throw new AccountRecoveryError("expired");
      }
    }

    throw error;
  }
}

export const accountRecoveryActions: AccountRecoveryActions = {
  requestReset(email) {
    return handleRecoveryRequest(() => requestPasswordReset(email));
  },

  resetPassword(input) {
    return handleRecoveryRequest(() => sendResetPassword(input));
  },

  verifyEmail: unavailable,
  resendVerification: unavailable
};
