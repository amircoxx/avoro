/** Contains referral rules that are independent of persistence and HTTP concerns. */
import { AppError } from "../utils/errors";

export function assertNotSelfReferral(referrerTechProfileId: string, referredTechProfileId: string) {
  if (referrerTechProfileId === referredTechProfileId) {
    throw new AppError("A tech cannot refer themselves", 409, "self_referral");
  }
}
