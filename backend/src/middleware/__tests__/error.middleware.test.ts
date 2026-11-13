import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../error.middleware";

describe("error middleware privacy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only allowlisted request and error metadata on an unexpected failure", () => {
    const secretBody = "PRIVATE_MESSAGE_SENTINEL";
    const secretCookie = "COOKIE_SENTINEL";
    const secretEmail = "EMAIL_SENTINEL@example.test";
    const secretHeader = "HEADER_SENTINEL";
    const error = Object.assign(new Error(`Invalid prisma invocation with ${secretBody} ${secretCookie} ${secretEmail}`), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
      meta: { body: secretBody }
    });
    const request = {
      method: "POST",
      route: { path: "/conversations/:conversationId/read" },
      headers: { "x-request-id": secretHeader, cookie: secretCookie },
      body: { body: secretBody, email: secretEmail }
    };
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    errorHandler(error, request as never, { status, json } as never, vi.fn());

    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).toContain("request.failed");
    expect(log.mock.calls[0]?.[1]).toMatchObject({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(serialized).toContain("POST /conversations/:conversationId/read");
    expect(serialized).toContain("PrismaClientKnownRequestError");
    expect(serialized).toContain("P2025");
    expect(serialized).not.toContain(secretBody);
    expect(serialized).not.toContain(secretCookie);
    expect(serialized).not.toContain(secretEmail);
    expect(serialized).not.toContain(secretHeader);
  });
});
