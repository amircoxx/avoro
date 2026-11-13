import { describe, expect, it, vi } from "vitest";
import { resolveCustomerForSavedTech } from "../customer-saves";

describe("resolveCustomerForSavedTech", () => {
  it("refreshes the account when the profile page mounted before login", async () => {
    const getCurrentUser = vi.fn().mockResolvedValue({ id: "customer-1", role: "CUSTOMER" });

    await expect(resolveCustomerForSavedTech(null, getCurrentUser)).resolves.toEqual({ id: "customer-1", role: "CUSTOMER" });
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });

  it("uses the already loaded account without making another request", async () => {
    const customer = { id: "customer-1", role: "CUSTOMER" };
    const getCurrentUser = vi.fn();

    await expect(resolveCustomerForSavedTech(customer, getCurrentUser)).resolves.toBe(customer);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
