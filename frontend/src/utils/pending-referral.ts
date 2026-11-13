const pendingReferralKey = "find-my-tech:pending-referral-code";

function pendingReferralStorage() {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function savePendingReferralCode(code: string) {
  const normalizedCode = code.trim();
  if (normalizedCode) pendingReferralStorage()?.setItem(pendingReferralKey, normalizedCode);
}

export function readPendingReferralCode() {
  return pendingReferralStorage()?.getItem(pendingReferralKey) ?? "";
}

export function clearPendingReferralCode() {
  pendingReferralStorage()?.removeItem(pendingReferralKey);
}
