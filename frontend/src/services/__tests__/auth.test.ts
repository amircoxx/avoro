import { afterEach, describe, expect, it, vi } from "vitest";
import { changePassword } from "../api";

describe("auth API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("changes a password with session credentials and the exact server payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { passwordChanged: true } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      currentPassword: "current password",
      newPassword: "new password 12345"
    };

    await expect(changePassword(input)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  });
});
