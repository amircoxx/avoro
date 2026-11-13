import { createCheckoutSession } from "../services/purchasing/purchasing.service"
import { requireRole } from "../services/session.service";
import { Request, Response, NextFunction } from "express";
import { checkoutInputSchema } from "../validations/purchasing.schema";


export async function createCheckoutSessionHandler(request: Request, response: Response, next: NextFunction) {
    try{
        const user = await requireRole(request.headers.cookie, ["TECH"])
        const input = checkoutInputSchema.parse(request.body)

        const url = await createCheckoutSession(user.id, input);

        response.json({ data: { url } });
    } catch (error) {
        next(error);
    }
}