import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const session = vi.hoisted(() => ({
  requireRole: vi.fn()
}));
const savedTechs = vi.hoisted(() => ({
  listSavedTechsForCustomer: vi.fn(),
  saveTechForCustomer: vi.fn(),
  removeSavedTechForCustomer: vi.fn()
}));
const techSearch = vi.hoisted(() => ({ getFeaturedTechs: vi.fn(), searchTechsByCity: vi.fn() }));
const techProfiles = vi.hoisted(() => ({
  getPublicTechProfile: vi.fn(),
  getTechProfileForUser: vi.fn(),
  upsertTechProfile: vi.fn()
}));

vi.mock("../services/session.service", () => session);
vi.mock("../services/saved-tech.service", () => savedTechs);
vi.mock("../services/tech-search.service", () => techSearch);
vi.mock("../services/tech-profile.service", () => techProfiles);

import { app } from "../app";

const customer = {
  id: "customer-1",
  email: "customer@example.com",
  role: "CUSTOMER",
  fullName: "Customer",
  avatarUrl: null
};

describe("saved-tech API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists saved techs for the authenticated customer", async () => {
    session.requireRole.mockResolvedValue(customer);
    savedTechs.listSavedTechsForCustomer.mockResolvedValue([{ id: "tech-1", businessName: "Gloss Room" }]);

    const response = await request(app).get("/api/saved-techs");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: "tech-1", businessName: "Gloss Room" }] });
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["CUSTOMER"]);
    expect(savedTechs.listSavedTechsForCustomer).toHaveBeenCalledWith("customer-1");
  });

  it("routes the featured path to the public featured-tech handler", async () => {
    techSearch.getFeaturedTechs.mockResolvedValue([{ id: "tech-1", reviewCount: 12 }]);

    const response = await request(app).get("/api/techs/featured?limit=99");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ id: "tech-1", reviewCount: 12 }] });
    expect(techSearch.getFeaturedTechs).toHaveBeenCalledWith(6);
  });

  it("saves a published profile for the authenticated customer", async () => {
    session.requireRole.mockResolvedValue(customer);
    savedTechs.saveTechForCustomer.mockResolvedValue({ saved: true });

    const response = await request(app).put("/api/techs/tech-1/saved");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { saved: true } });
    expect(savedTechs.saveTechForCustomer).toHaveBeenCalledWith("customer-1", "tech-1");
  });

  it("removes a saved profile for the authenticated customer", async () => {
    session.requireRole.mockResolvedValue(customer);
    savedTechs.removeSavedTechForCustomer.mockResolvedValue({ saved: false });

    const response = await request(app).delete("/api/techs/tech-1/saved");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { saved: false } });
    expect(savedTechs.removeSavedTechForCustomer).toHaveBeenCalledWith("customer-1", "tech-1");
  });

  it("keeps the forbidden error contract for tech accounts", async () => {
    session.requireRole.mockRejectedValue(new AppError("Insufficient permissions", 403, "forbidden"));

    const response = await request(app).get("/api/saved-techs");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: "forbidden", message: "Insufficient permissions" } });
  });
});
