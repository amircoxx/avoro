/** Validates the small set of runtime configuration values consumed by the backend. */
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

function readPort(value: string | undefined) {
  const parsed = Number(value ?? "3001");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3001;
}

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function stripeReadRequired(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error("Stripe secret key is required");
  }
  return trimmed;
}

export const env = {
  PORT: readPort(process.env.PORT),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  BREVO_API_KEY: readOptional(process.env.BREVO_API_KEY),
  BOOKING_EMAIL_FROM: readOptional(process.env.BOOKING_EMAIL_FROM),
  BOOKING_EMAIL_FROM_NAME: readOptional(process.env.BOOKING_EMAIL_FROM_NAME),
  APP_PUBLIC_URL: readOptional(process.env.APP_PUBLIC_URL),
  DATABASE_URL: readOptional(process.env.DATABASE_URL),
  MESSAGING_ENABLED: readBoolean(process.env.MESSAGING_ENABLED),
  STRIPE_SECRET_KEY: stripeReadRequired(process.env.STRIPE_SECRET_KEY),
  STRIPE_WEBHOOK_SECRET: readOptional(process.env.STRIPE_WEBHOOK_SECRET),
  STRIPE_PORTAL_CONFIGURATION_ID: readOptional(process.env.STRIPE_PORTAL_CONFIGURATION_ID),
};
