/** Zod contracts and integrity checks for direct image uploads. */
import { z } from "zod";

export const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const maxUploadBytes = 10 * 1024 * 1024;
const fileDataUrlSchema = z.string().trim().startsWith("data:image/").max(15 * 1024 * 1024);

export const signUploadInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedImageMimeTypes),
  fileSizeBytes: z.number().int().positive().max(maxUploadBytes),
  altText: z.string().trim().max(240).optional(),
  fileDataUrl: fileDataUrlSchema.optional()
});

export type SignUploadInput = z.infer<typeof signUploadInputSchema>;

export const profileMediaRoleSchema = z.enum(["profile", "background", "gallery"]);
export const profileMediaUploadInputSchema = withVerifiedFileData(
  signUploadInputSchema.extend({
    role: profileMediaRoleSchema,
    fileDataUrl: fileDataUrlSchema
  })
);
export type ProfileMediaUploadInput = z.infer<typeof profileMediaUploadInputSchema>;

function withVerifiedFileData<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.superRefine((input, context) => {
    if (!input.fileDataUrl) return;

    const separator = input.fileDataUrl.indexOf(",");
    const payload = separator === -1 ? "" : input.fileDataUrl.slice(separator + 1);
    if (!isCanonicalBase64(payload)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileDataUrl"],
        message: "Uploaded image data must contain valid base64"
      });
      return;
    }

    const decodedBytes = Buffer.byteLength(payload, "base64");
    if (decodedBytes > maxUploadBytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileDataUrl"],
        message: "Uploaded image data exceeds 10 MiB"
      });
    }
    if (decodedBytes !== input.fileSizeBytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileDataUrl"],
        message: "Uploaded image size does not match fileSizeBytes"
      });
    }
  });
}

function isCanonicalBase64(value: string) {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  const paddingStart = value.indexOf("=");
  const contentEnd = paddingStart === -1 ? value.length : paddingStart;
  const paddingLength = value.length - contentEnd;
  if (paddingLength > 2) return false;
  for (let index = 0; index < contentEnd; index += 1) {
    const code = value.charCodeAt(index);
    const isBase64Character = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47;
    if (!isBase64Character) return false;
  }
  for (let index = contentEnd; index < value.length; index += 1) {
    if (value[index] !== "=") return false;
  }
  return true;
}
