import { prisma } from "./database.model";

/** Returns zero when allowed, otherwise seconds until this IP's window expires. */
export async function consumePasswordResetIpLimit(ip: string): Promise<number> {
  // One atomic upsert locks the IP row, including when requests arrive together.
  // Database time keeps the window consistent across backend instances.
  const [result] = await prisma.$queryRaw<Array<{ retryAfterSeconds: number }>>`
    INSERT INTO "PasswordResetIpLimit" AS limiter ("ip", "requestCount", "windowStartedAt")
    VALUES (${ip}::inet, 1, statement_timestamp())
    ON CONFLICT ("ip") DO UPDATE SET
      "requestCount" = CASE
        WHEN limiter."windowStartedAt" <= statement_timestamp() - INTERVAL '15 minutes' THEN 1
        ELSE LEAST(limiter."requestCount" + 1, 6)
      END,
      "windowStartedAt" = CASE
        WHEN limiter."windowStartedAt" <= statement_timestamp() - INTERVAL '15 minutes'
          THEN statement_timestamp()
        ELSE limiter."windowStartedAt"
      END
    RETURNING CASE WHEN "requestCount" <= 5 THEN 0
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM
        ("windowStartedAt" + INTERVAL '15 minutes' - statement_timestamp())))::integer)
      END AS "retryAfterSeconds"
  `;
  return result.retryAfterSeconds;
}
