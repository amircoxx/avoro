import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPendingReferralCode, readPendingReferralCode, savePendingReferralCode } from "../pending-referral";

describe("pending referral code", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
  });

  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps a signup referral code until the new tech profile is saved", () => {
    savePendingReferralCode(" gloss-1 ");

    expect(readPendingReferralCode()).toBe("gloss-1");
    clearPendingReferralCode();
    expect(readPendingReferralCode()).toBe("");
  });
});
