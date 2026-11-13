import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app";

describe("Express app", () => {
  it("returns the API not-found JSON contract", async () => {
    const response = await request(app).get("/api/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "not_found", message: "Route not found" }
    });
  });

  it("keeps registration validation errors in the API contract", async () => {
    const response = await request(app).post("/api/auth/register").send({});

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: { code: "validation_error", message: "Request validation failed" }
    });
  });
});
