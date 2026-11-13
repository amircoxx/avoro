import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderMessagingEmail } from "../messaging-email";

const payload = {
  conversationId: "conversation-1",
  senderDisplayName: "Avery",
  recipientRole: "TECH" as const,
  appPublicUrl: "https://avoro.example/"
};

describe("renderMessagingEmail", () => {
  it.each([
    ["EMAIL_REQUEST", undefined, "New message request from Avery"],
    ["EMAIL_DECISION", "ACCEPTED", "Avery accepted your message request"],
    ["EMAIL_DECISION", "DECLINED", "Avery declined your message request"],
    ["EMAIL_MESSAGE", undefined, "New message from Avery"]
  ] as const)("renders the %s notification without a message body", (kind, decision, subject) => {
    const rendered = renderMessagingEmail(kind, { ...payload, ...(decision ? { decision } : {}) });

    expect(rendered.subject).toBe(subject);
    expect(rendered.textContent).toContain("https://avoro.example/messages");
    expect(rendered.htmlContent).toContain("https://avoro.example/messages");
    expect(rendered.textContent).not.toContain("private message body");
    expect(JSON.stringify(rendered)).not.toContain("body");
  });

  it("keeps the renderer input body-free", () => {
    const source = readFileSync(new URL("../messaging-email.ts", import.meta.url), "utf8");

    expect(source).not.toContain("body:");
    expect(source).not.toContain("message.body");
  });
});
