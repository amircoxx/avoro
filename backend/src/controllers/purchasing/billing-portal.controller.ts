import type { Request, Response, NextFunction } from "express";
import { createBillingPortalSession } from "../../services/purchasing/purchasing.service";
import { requireRole } from "../../services/session.service";

export async function createBillingPortalSessionHandler(request: Request, response: Response, next: NextFunction) {
  response.set("Cache-Control", "no-store");
  try {
    const user = await requireRole(request.headers.cookie, ["TECH"]);
    const url = await createBillingPortalSession(user.id);
    response.json({ data: { url } });
  } catch (error) {
    next(error);
  }
}
