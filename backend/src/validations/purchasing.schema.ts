import { z } from "zod";

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const checkoutInputSchema = z.object({
  planId: z.enum(["starter", "studio", "signature"]),
  interval: z.enum(["monthly", "yearly"])
});

