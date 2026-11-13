/** Persists referrals and portfolio-upload records for the authenticated tech. */
import { prisma } from "../models/database.model";
import { assertNotSelfReferral } from "./referral.rules";
import type { ReferralInput } from "../validations/referral.schema";
import type { SignUploadInput } from "../validations/upload.schema";
import { AppError } from "../utils/errors";
import { saveProfileMedia } from "./profile-media.service";

export async function createReferral(userId: string, input: ReferralInput) {
  return prisma.$transaction(async (tx) => {
    const referredTechProfile = await tx.techProfile.findUnique({ where: { userId } });
    if (!referredTechProfile) {
      throw new AppError("Create your tech profile before applying a referral code", 409, "missing_tech_profile");
    }

    const referrerTechProfile = await tx.techProfile.findUnique({
      where: { referralCode: input.referralCode }
    });
    if (!referrerTechProfile) {
      throw new AppError("Referral code not found", 404, "referral_code_not_found");
    }

    assertNotSelfReferral(referrerTechProfile.id, referredTechProfile.id);

    const existingReferral = await tx.referral.findUnique({
      where: { referredTechProfileId: referredTechProfile.id }
    });
    if (existingReferral) {
      return tx.referral.update({
        where: { id: existingReferral.id },
        data: { referrerTechProfileId: referrerTechProfile.id, referralCodeUsed: input.referralCode }
      });
    }

    const referral = await tx.referral.create({
      data: {
        referrerTechProfileId: referrerTechProfile.id,
        referredTechProfileId: referredTechProfile.id,
        referralCodeUsed: input.referralCode
      }
    });
    await tx.techProfile.update({
      where: { id: referrerTechProfile.id },
      data: { referralCount: { increment: 1 } }
    });
    return referral;
  });
}

export async function createPortfolioUploadRecord(userId: string, input: SignUploadInput) {
  const image = await saveProfileMedia(userId, { ...input, role: "gallery" });

  return {
    image,
    uploadUrl: null,
    message: input.fileDataUrl
      ? "Portfolio image was added to your profile."
      : "Portfolio metadata was saved. File storage is not configured yet."
  };
}
