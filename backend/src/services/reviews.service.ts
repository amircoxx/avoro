/** Creates or updates reviews and keeps each tech's rating summary synchronized. */
import { prisma } from "../models/database.model";
import type { ReviewInput } from "../validations/review.schema";
import { AppError } from "../utils/errors";

export async function upsertReview(userId: string, techProfileId: string, input: ReviewInput) {
  const techProfile = await prisma.techProfile.findUnique({ where: { id: techProfileId } });
  if (!techProfile) {
    throw new AppError("Tech profile not found", 404, "not_found");
  }
  if (techProfile.userId === userId) {
    throw new AppError("A tech cannot review their own profile", 409, "self_review");
  }
  const comment = input.comment ?? "";

  const review = await prisma.review.upsert({
    where: {
      techProfileId_reviewerId: {
        techProfileId,
        reviewerId: userId
      }
    },
    update: {
      rating: input.rating,
      comment
    },
    create: {
      techProfileId,
      reviewerId: userId,
      rating: input.rating,
      comment
    }
  });

  await refreshReviewSummary(techProfileId);
  return review;
}

async function refreshReviewSummary(techProfileId: string) {
  const aggregate = await prisma.review.aggregate({
    where: { techProfileId },
    _avg: { rating: true },
    _count: { rating: true }
  });

  await prisma.techProfile.update({
    where: { id: techProfileId },
    data: {
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count.rating
    }
  });
}
