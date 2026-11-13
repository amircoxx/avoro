/** Isolates Brevo's transactional email HTTP contract and sanitized errors. */
export type BrevoEmailMessage = {
  sender: { email: string; name: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
};

export type EmailSendOptions = { signal?: AbortSignal };

export interface EmailClient {
  send(message: BrevoEmailMessage, options?: EmailSendOptions): Promise<{ messageId: string }>;
}

export const DEFAULT_BREVO_REQUEST_TIMEOUT_MS = 45_000;

export class BrevoEmailError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "BrevoEmailError";
  }
}

export class BrevoEmailClient implements EmailClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestTimeoutMs = DEFAULT_BREVO_REQUEST_TIMEOUT_MS
  ) {}

  async send(message: BrevoEmailMessage, options: EmailSendOptions = {}): Promise<{ messageId: string }> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    timeout.unref?.();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": this.apiKey,
            accept: "application/json",
            "content-type": "application/json"
          },
          body: JSON.stringify(message),
          signal: controller.signal
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new BrevoEmailError("Brevo email request timed out or was aborted", undefined, true);
        }
        throw new BrevoEmailError("Brevo email network request failed", undefined, true);
      }

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new BrevoEmailError(`Brevo email request failed with status ${response.status}`, response.status, retryable);
      }

      try {
        const body = await response.json() as { messageId?: unknown };
        if (typeof body.messageId !== "string") throw new Error("missing messageId");
        const messageId = body.messageId.trim();
        if (!messageId) throw new Error("missing messageId");
        return { messageId };
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new BrevoEmailError("Brevo email request timed out or was aborted", undefined, true);
        }
        throw new BrevoEmailError("Brevo email response was invalid", response.status, false);
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
