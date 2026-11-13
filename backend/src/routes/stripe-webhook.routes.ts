import Router from "express";
import { stripeWebhookHandler } from "../controllers/stripe-webhook.controller";

export const stripeWebhookRouter = Router();
stripeWebhookRouter.post("/", stripeWebhookHandler);