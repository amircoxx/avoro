/** Renders privacy-safe notification emails for messaging events. */
export type MessagingEmailKind = "EMAIL_REQUEST" | "EMAIL_DECISION" | "EMAIL_MESSAGE";

export type MessagingEmailPayload = {
  conversationId: string;
  senderDisplayName: string;
  recipientRole: "CUSTOMER" | "TECH";
  decision?: "ACCEPTED" | "DECLINED";
  appPublicUrl: string;
};

export type RenderedEmail = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

export function renderMessagingEmail(kind: MessagingEmailKind, payload: MessagingEmailPayload): RenderedEmail {
  const messagesUrl = `${payload.appPublicUrl.replace(/\/$/, "")}/messages`;
  const { subject, notice } = templateCopy(kind, payload.senderDisplayName, payload.decision);
  return {
    subject,
    textContent: `${notice}\n\nOpen your messages: ${messagesUrl}`,
    htmlContent: `<p>${escapeHtml(notice)}</p><p><a href="${escapeHtml(messagesUrl)}">Open your messages</a></p>`
  };
}

function templateCopy(kind: MessagingEmailKind, senderDisplayName: string, decision: MessagingEmailPayload["decision"]) {
  if (kind === "EMAIL_REQUEST") {
    return { subject: `New message request from ${senderDisplayName}`, notice: `${senderDisplayName} sent you a message request.` };
  }
  if (kind === "EMAIL_MESSAGE") {
    return { subject: `New message from ${senderDisplayName}`, notice: `You have a new message from ${senderDisplayName}.` };
  }
  if (decision === "ACCEPTED") {
    return { subject: `${senderDisplayName} accepted your message request`, notice: `${senderDisplayName} accepted your message request.` };
  }
  if (decision === "DECLINED") {
    return { subject: `${senderDisplayName} declined your message request`, notice: `${senderDisplayName} declined your message request.` };
  }
  throw new Error("Messaging email decision is required");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
