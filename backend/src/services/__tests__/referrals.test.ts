import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  techProfile: { findUnique: vi.fn(), update: vi.fn() },
  referral: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn()
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import { createReferral } from "../referrals.service";

describe("createReferral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.techProfile.findUnique
      .mockResolvedValueOnce({ id: "referred-profile" })
      .mockResolvedValueOnce({ id: "referrer-profile" });
  });

  it("increments the referrer exactly once when it creates a referral", async () => {
    tx.referral.findUnique.mockResolvedValue(null);
    tx.referral.create.mockResolvedValue({ id: "referral-1" });

    await expect(createReferral("referred-user", { referralCode: "GLOSS-1" })).resolves.toEqual({ id: "referral-1" });
    expect(tx.referral.create).toHaveBeenCalledWith({
      data: {
        referrerTechProfileId: "referrer-profile",
        referredTechProfileId: "referred-profile",
        referralCodeUsed: "GLOSS-1"
      }
    });
    expect(tx.techProfile.update).toHaveBeenCalledWith({
      where: { id: "referrer-profile" },
      data: { referralCount: { increment: 1 } }
    });
  });

  it("does not increment again when the referred profile already has a referral", async () => {
    tx.referral.findUnique.mockResolvedValue({ id: "referral-1" });
    tx.referral.update.mockResolvedValue({ id: "referral-1" });

    await createReferral("referred-user", { referralCode: "GLOSS-1" });

    expect(tx.referral.update).toHaveBeenCalledWith({
      where: { id: "referral-1" },
      data: { referrerTechProfileId: "referrer-profile", referralCodeUsed: "GLOSS-1" }
    });
    expect(tx.techProfile.update).not.toHaveBeenCalled();
  });

  it("rejects a self-referral before it can create a referral record", async () => {
    tx.techProfile.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: "same-profile" })
      .mockResolvedValueOnce({ id: "same-profile" });

    await expect(createReferral("referred-user", { referralCode: "GLOSS-1" })).rejects.toMatchObject({
      status: 409,
      code: "self_referral"
    });
    expect(tx.referral.create).not.toHaveBeenCalled();
  });
});
