/** Configures the Express application, shared middleware, and top-level API router. */
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { apiRouter } from "./routes/api.routes";
import { stripeWebhookRouter } from "./routes/stripe-webhook.routes";

export const app = express();

app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(
  "/api/purchases/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRouter
);

app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());
app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
