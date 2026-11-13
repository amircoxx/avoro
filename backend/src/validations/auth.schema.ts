/** Zod contracts for authentication and account-update request bodies. */
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());

const passwordSchema = z.string().min(12).max(200);

const roleSchema = z.enum(["customer", "tech"]).transform((role) => (role === "tech" ? "TECH" : "CUSTOMER"));

const referralCodeSchema = z.string().trim().min(1).max(20).optional();

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
  fullName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .transform((value) => value || undefined),
  referralCode: referralCodeSchema
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200)
});

export const accountUpdateInputSchema = z.object({
  email: emailSchema,
  fullName: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null)
});

export const passwordChangeInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema
});

export const forgotPasswordInputSchema = z.object({
  email: emailSchema
});

export const resetPasswordInputSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  newPassword: passwordSchema
});


export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateInputSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeInputSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;