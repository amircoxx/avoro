import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";

export async function createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    await prisma.passwordResetToken.create({data: { userId, tokenHash, expiresAt }});
}

export async function getPasswordResetToken(tokenHash: string) {
    return await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
}

export async function completePasswordReset(newPasswordHash: string, userId: string, tokenHash: string) {
    
    await prisma.$transaction(async (tx) => {

        const deleted = await tx.passwordResetToken.deleteMany({
            where: {
                tokenHash,
                userId,
                expiresAt: { gt: new Date() }
            }
        });
        // Ensure that exactly one token was deleted, indicating that the token was valid and not expired
        if (deleted.count !== 1) {
            throw new AppError(
                "Invalid or expired password reset token",
                400,
                "invalid_reset_token"
            );
        }
        //update password hash for the user
        await tx.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash }
        });
        //invalidate all other password reset tokens and revoke all active sessions for the user
        await tx.passwordResetToken.deleteMany({
            where: { userId }
        });
        await tx.userSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() }
        })
    })
}