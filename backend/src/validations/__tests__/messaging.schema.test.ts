import { describe, expect, it } from "vitest";
import { createMessageRequestSchema, markReadSchema, normalizeMessageBody } from "../messaging.schema";

describe("messaging validation", () => {
  it("normalizes line endings and rejects more than 2,000 Unicode code points", () => {
    expect(normalizeMessageBody("  hello\r\nthere  ")).toBe("hello\nthere");
    expect(() => createMessageRequestSchema.parse({
      techProfileId: "12dcb560-d78f-4c0f-a228-581b871d8db6",
      body: "😀".repeat(2_001),
      clientRequestId: "3754164f-7c66-4c13-ad80-f810453c07f5"
    })).toThrow();
  });

  it("accepts only UUID request identifiers and decimal read cursors", () => {
    expect(createMessageRequestSchema.parse({
      techProfileId: "12dcb560-d78f-4c0f-a228-581b871d8db6",
      body: "Can you work with color-treated hair?",
      clientRequestId: "3754164f-7c66-4c13-ad80-f810453c07f5"
    }).body).toBe("Can you work with color-treated hair?");
    expect(markReadSchema.parse({ throughSequence: "42" })).toEqual({ throughSequence: "42" });
    expect(() => markReadSchema.parse({ throughSequence: "-1" })).toThrow();
  });
});
