import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { getSavedTechs, removeSavedTech, saveTech } from "../api";

describe("saved-tech API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps saved-tech functions available from the public API module", () => {
    expect(api.getSavedTechs).toBeTypeOf("function");
    expect(api.saveTech).toBeTypeOf("function");
    expect(api.removeSavedTech).toBeTypeOf("function");
  });

  it("lists saved techs with session credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));

    await expect(getSavedTechs()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/api/saved-techs", { credentials: "include" });
  });

  it("saves and removes a tech with the correct method and credentials", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { saved: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { saved: false } }), { status: 200 })));

    await expect(saveTech("tech id")).resolves.toEqual({ saved: true });
    await expect(removeSavedTech("tech id")).resolves.toEqual({ saved: false });
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/techs/tech%20id/saved", { method: "PUT", credentials: "include" });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/techs/tech%20id/saved", { method: "DELETE", credentials: "include" });
  });
});
