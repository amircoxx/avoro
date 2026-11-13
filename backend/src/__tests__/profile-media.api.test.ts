import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const session = vi.hoisted(() => ({ requireRole: vi.fn() }));
const profileMedia = vi.hoisted(() => ({
  saveProfileMedia: vi.fn(),
  deleteProfileMedia: vi.fn()
}));

vi.mock("../services/session.service", () => session);
vi.mock("../services/profile-media.service", () => profileMedia);

import { app } from "../app";

const tech = {
  id: "tech-user-1",
  email: "tech@example.com",
  role: "TECH",
  fullName: "Tech",
  avatarUrl: null
};

const upload = {
  role: "profile",
  fileName: "profile.png",
  contentType: "image/png",
  fileSizeBytes: 1,
  fileDataUrl: "data:image/png;base64,AA=="
};

const groupedMedia = {
  profileImage: { id: "profile-1", imageUrl: upload.fileDataUrl, altText: null, sortOrder: 0 },
  backgroundImage: null,
  galleryImages: []
};

describe("profile-media API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication to upload profile media", async () => {
    session.requireRole.mockRejectedValue(new AppError("Authentication required", 401, "unauthorized"));

    const response = await request(app).post("/api/uploads/profile-media").send(upload);

    expect(response.status).toBe(401);
    expect(profileMedia.saveProfileMedia).not.toHaveBeenCalled();
  });

  it("forbids customer accounts from uploading profile media", async () => {
    session.requireRole.mockRejectedValue(new AppError("Insufficient permissions", 403, "forbidden"));

    const response = await (request(app)
      .post("/api/uploads/profile-media") as unknown as CookieRequest)
      .set("Cookie", "session=customer")
      .send(upload);

    expect(response.status).toBe(403);
    expect(session.requireRole).toHaveBeenCalledWith("session=customer", ["TECH"]);
    expect(profileMedia.saveProfileMedia).not.toHaveBeenCalled();
  });

  it("rejects unsupported media roles", async () => {
    session.requireRole.mockResolvedValue(tech);

    const response = await request(app)
      .post("/api/uploads/profile-media")
      .send({ ...upload, role: "video" });

    expect(response.status).toBe(400);
    expect(profileMedia.saveProfileMedia).not.toHaveBeenCalled();
  });

  it("rejects direct uploads without encoded image bytes before persistence", async () => {
    session.requireRole.mockResolvedValue(tech);
    const { fileDataUrl: _fileDataUrl, ...uploadWithoutData } = upload;

    const response = await request(app)
      .post("/api/uploads/profile-media")
      .send(uploadWithoutData);

    expect(response.status).toBe(400);
    expect(apiBody(response).error?.code).toBe("validation_error");
    expect(profileMedia.saveProfileMedia).not.toHaveBeenCalled();
  });

  it("parses requests larger than Express's default JSON limit before validation", async () => {
    session.requireRole.mockResolvedValue(tech);

    const response = await request(app)
      .post("/api/uploads/profile-media")
      .send({ ...upload, role: "video", fileDataUrl: `data:image/png;base64,${"A".repeat(110 * 1024)}` });

    expect(response.status).toBe(400);
    expect(apiBody(response).error?.code).toBe("validation_error");
  });

  it("returns the complete grouped media state after upload", async () => {
    session.requireRole.mockResolvedValue(tech);
    profileMedia.saveProfileMedia.mockResolvedValue(groupedMedia);

    const response = await request(app).post("/api/uploads/profile-media").send(upload);

    expect(response.status).toBe(201);
    expect(apiBody(response).data).toEqual({
      profileImage: expect.anything(),
      backgroundImage: null,
      galleryImages: []
    });
    expect(profileMedia.saveProfileMedia).toHaveBeenCalledWith("tech-user-1", upload);
  });

  it("returns a structured validation error when decoded size differs from the declaration", async () => {
    session.requireRole.mockResolvedValue(tech);

    const response = await request(app)
      .post("/api/uploads/profile-media")
      .send({ ...upload, fileSizeBytes: 2 });

    expect(response.status).toBe(400);
    expect(apiBody(response).error?.code).toBe("validation_error");
    expect(profileMedia.saveProfileMedia).not.toHaveBeenCalled();
  });

  it("returns gallery_full when a tech uploads a thirteenth gallery image", async () => {
    session.requireRole.mockResolvedValue(tech);
    profileMedia.saveProfileMedia.mockRejectedValue(
      new AppError("Gallery images are limited to 12", 409, "gallery_full")
    );

    const response = await request(app)
      .post("/api/uploads/profile-media")
      .send({ ...upload, role: "gallery" });

    expect(response.status).toBe(409);
    expect(apiBody(response).error?.code).toBe("gallery_full");
  });

  it("returns the complete grouped media state after an owner deletion", async () => {
    session.requireRole.mockResolvedValue(tech);
    profileMedia.deleteProfileMedia.mockResolvedValue({
      profileImage: null,
      backgroundImage: null,
      galleryImages: []
    });

    const response = await request(app).delete("/api/uploads/profile-media/media-1");

    expect(response.status).toBe(200);
    expect(apiBody(response).data).toEqual({ profileImage: null, backgroundImage: null, galleryImages: [] });
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["TECH"]);
    expect(profileMedia.deleteProfileMedia).toHaveBeenCalledWith("tech-user-1", "media-1");
  });
});

type ApiResponse = { body: unknown };
type CookieRequest = {
  set(name: string, value: string): { send(body: unknown): Promise<ApiResponse & { status: number }> };
};

function apiBody(response: ApiResponse) {
  return response.body as { data?: unknown; error?: { code?: string } };
}
