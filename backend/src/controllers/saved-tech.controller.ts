/** HTTP adapter for the authenticated customer's saved-tech collection. */
import type { NextFunction, Request, Response } from "express";
import { listSavedTechsForCustomer } from "../services/saved-tech.service";
import { requireRole } from "../services/session.service";

export async function listSavedTechs(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    response.json({ data: await listSavedTechsForCustomer(user.id) });
  } catch (error) {
    next(error);
  }
}
