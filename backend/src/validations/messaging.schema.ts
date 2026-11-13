/** Validates normalized messaging inputs and cursor query values before service handling. */
import { z } from "zod";

const uuid = z.string().uuid();
const sequence = z.string().regex(/^(0|[1-9]\d*)$/);

export function normalizeMessageBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

const body = z.string().transform(normalizeMessageBody).superRefine((value, context) => {
  if (!value) context.addIssue({ code: z.ZodIssueCode.custom, message: "Message cannot be empty" });
  if ([...value].length > 2_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Message is too long" });
});

export const createMessageRequestSchema = z.object({ techProfileId: uuid, body, clientRequestId: uuid }).strict();
export const sendMessageSchema = z.object({ conversationId: uuid, body, clientRequestId: uuid }).strict();
export const conversationIdParamSchema = z.object({ conversationId: uuid }).strict();
export const markReadSchema = z.object({ throughSequence: sequence }).strict();
export const conversationListQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED"]).optional(),
  archived: z.enum(["true", "false"]).default("false"),
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30)
}).strict();
export const messagePageQuerySchema = z.object({
  beforeSequence: sequence.optional(),
  afterSequence: sequence.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50)
}).strict().refine((value) => !(value.beforeSequence && value.afterSequence), "Choose one message cursor");
export const syncQuerySchema = z.object({
  afterSequence: sequence.default("0"),
  limit: z.coerce.number().int().min(1).max(100).default(100)
}).strict();
