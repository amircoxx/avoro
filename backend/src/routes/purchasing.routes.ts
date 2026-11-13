import { Router } from "express";
import { createCheckoutSessionHandler } from "../controllers/pricing.controller";
import { createBillingPortalSessionHandler } from "../controllers/purchasing/billing-portal.controller";

export const purchasesRouter = Router();
purchasesRouter.post("/checkout", createCheckoutSessionHandler);
purchasesRouter.post("/portal", createBillingPortalSessionHandler);
