import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";
import { createHash } from "crypto";
import { hashPassword } from "./password.service";
import { completePasswordReset, getPasswordResetToken } from "../models/password-reset.model";

export async function completePasswordResetService(token: string, newPassword: string) {

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const passwordResetToken = await getPasswordResetToken(tokenHash);
    if (!passwordResetToken || passwordResetToken.expiresAt < new Date()) {
        throw new AppError("Invalid or expired password reset token", 400, "invalid_reset_token");
    }
    const hashedPassword = await hashPassword(newPassword);
    await completePasswordReset(hashedPassword, passwordResetToken.userId, tokenHash);

}
