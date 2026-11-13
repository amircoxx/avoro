import { prisma } from "./database.model";
import { randomUUID } from "crypto";

export async function createPasswordResetRequest(email: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const nextAllowedAt = new Date(now.getTime() + 60_000);

    // Create an initially eligible cooldown record if none exists.
    await tx.passwordResetCooldown.createMany({
      data: [{ email, nextAllowedAt: now }],
      skipDuplicates: true
    });

    // Claim this email's cooldown only if it has expired.
    const claimed = await tx.passwordResetCooldown.updateMany({
      where: {
        email,
        nextAllowedAt: { lte: now }
      },
      data: {
        nextAllowedAt
      }
    });

    if (claimed.count !== 1) return false;

    await tx.passwordResetRequest.create({
      data: { email }
    });

    return true;
  });
}

export async function claimPasswordResetRequest() {
  const now = new Date();

  const eligible = {
    completedAt: null,
    failedAt: null,
    sendStartedAt: null,
    attempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS },
    availableAt: { lte: now },
    OR: [
      { leaseUntil: null },
      { leaseUntil: { lte: now } }
    ]
  };

  const request = await prisma.passwordResetRequest.findFirst({
    where: eligible,
    orderBy: [
      { availableAt: "asc" },
      { id: "asc" }
    ]
  });

  if (!request) return null;

  const claimId = randomUUID();
  const leaseUntil = new Date(Date.now() + 2 * 60 * 1000);

  const claimed = await prisma.passwordResetRequest.updateMany({
    where: {
      ...eligible,
      id: request.id,
      claimId: request.claimId, 
    },
    data: {
      claimId,
      leaseUntil,
      attempts: { increment: 1 }
    }
  });

  if (claimed.count !== 1) return null;

  return {
    id: request.id,
    email: request.email,
    claimId,
    leaseUntil,
    attempts: request.attempts + 1
  };
}

export async function completePasswordResetRequest(
  id: string,
  claimId: string
) {
  const now = new Date();

  const completed = await prisma.passwordResetRequest.updateMany({
    where: {
      id,
      claimId,
      completedAt: null,
      failedAt: null,
      leaseUntil: { gt: now }
    },
    data: {
      completedAt: now,
      claimId: null,
      leaseUntil: null
    }
  });

  return completed.count === 1;
}

export async function retryPasswordResetRequest(
  id: string,
  claimId: string,
  availableAt: Date
) {
  const now = new Date();

  const retried = await prisma.passwordResetRequest.updateMany({
    where: {
      id,
      claimId,
      completedAt: null,
      failedAt: null,
      leaseUntil: { gt: now }
    },
    data: {
      availableAt,
      claimId: null,
      leaseUntil: null,
      sendStartedAt: null
    }
  });

  return retried.count === 1;
}

export const PASSWORD_RESET_MAX_ATTEMPTS = 3;

export async function failPasswordResetRequest(id: string, claimId: string) {
  const now = new Date();

  const failed = await prisma.passwordResetRequest.updateMany({
    where: {
      id,
      claimId,
      completedAt: null,
      failedAt: null,
      leaseUntil: { gt: now }
    },
    data: {
      failedAt: now,
      claimId: null,
      leaseUntil: null
    }
  });

  return failed.count === 1;
}

export async function markPasswordResetRequestSendStarted(id: string, claimId: string) {
  const now = new Date();

  const marked = await prisma.passwordResetRequest.updateMany({
    where: {
      id,
      claimId,
      completedAt: null,
      failedAt: null,
      sendStartedAt: null,
      leaseUntil: { gt: now }
    },
    data: {
      sendStartedAt: now
    }
  });
  return marked.count === 1;
}