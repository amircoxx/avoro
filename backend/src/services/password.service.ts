/** Hashes and verifies passwords with versioned scrypt hashes. */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const hashPrefix = "scrypt";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, keyLength)) as Buffer;

  return `${hashPrefix}:${salt}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;

  const [algorithm, salt, storedKey] = passwordHash.split(":");
  if (algorithm !== hashPrefix || !salt || !storedKey) return false;

  const candidate = (await scrypt(password, salt, keyLength)) as Buffer;
  const stored = Buffer.from(storedKey, "base64url");

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
