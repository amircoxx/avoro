import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  prisma: { userSession: { updateMany: vi.fn() } }
}));

vi.mock("../../models/database.model", () => database);

import { hashSessionToken, revokeOtherUserSessions } from "../session.service";

describe("password-change session revocation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes only the user's other active sessions", async () => {
    await revokeOtherUserSessions("user-1", "active-token");

    expect(database.prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        tokenHash: { not: hashSessionToken("active-token") }
      },
      data: { revokedAt: expect.any(Date) }
    });
  });
});
