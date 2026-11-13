import { isIP } from "node:net";
import { createPasswordResetRequest } from "../models/password-reset-request.model";
import { consumePasswordResetIpLimit } from "../models/password-reset-ip-limit.model";
import { AppError } from "../utils/errors";

export async function requestPasswordReset(email: string, ip: string | undefined) {
  if (!ip || !isIP(ip)) {
    throw new AppError("Unable to process password reset. Please try again later.", 503, "client_ip_unavailable");
  }
  // Node can represent IPv4 peers as IPv4-mapped IPv6 addresses.
  const normalizedIp = ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  const retryAfterSeconds = await consumePasswordResetIpLimit(normalizedIp);
  if (retryAfterSeconds > 0) {
    throw new AppError("Too many password reset requests. Please try again later.", 429, "rate_limited", { retryAfterSeconds });
  }
  await createPasswordResetRequest(email);
}
