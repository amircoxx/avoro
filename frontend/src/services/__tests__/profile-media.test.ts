import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapTechProfileToArtist,
  removeProfileMedia,
  uploadProfileMedia,
  type PublicTechProfile,
  type TechProfileMedia
} from "../api";

const media = (id: string, imageUrl: string, sortOrder = 0) => ({
  id,
  imageUrl,
  altText: null,
  sortOrder
});

function profile(overrides: Partial<PublicTechProfile> = {}): PublicTechProfile {
  return {
    id: "tech-1",
    businessName: "Distinct Beauty",
    displayName: "@distinct",
    bio: null,
    phone: null,
    email: null,
    instagramUrl: null,
    bookingEnabled: false,
    bookingTimeZone: null,
    specialties: ["Nail Art"],
    averageRating: 5,
    reviewCount: 0,
    publicLocationLabel: "Atlanta, GA",
    services: [],
    reviews: [],
    profileImage: media("profile", "profile.jpg"),
    backgroundImage: media("background", "background.jpg"),
    galleryImages: [media("work-1", "work-1.jpg")],
    ...overrides
  };
}

describe("profile media mapping", () => {
  it("maps each media role to its matching artist field", () => {
    const artist = mapTechProfileToArtist(profile(), 0);

    expect(artist.photo).toBe("profile.jpg");
    expect(artist.cover).toBe("background.jpg");
    expect(artist.gallery).toEqual(["work-1.jpg"]);
  });

  it("retains gallery media and does not reuse it for missing presentation roles", () => {
    const artist = mapTechProfileToArtist(
      profile({
        profileImage: null,
        backgroundImage: null,
        galleryImages: [media("work-1", "work-1.jpg")]
      }),
      0
    );

    expect(artist.gallery).toEqual(["work-1.jpg"]);
    expect(artist.photo).not.toBe("work-1.jpg");
    expect(artist.cover).not.toBe("work-1.jpg");
  });
});

describe("profile media API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads direct image data with the exact requested role", async () => {
    const grouped: TechProfileMedia = {
      profileImage: media("profile", "profile.jpg"),
      backgroundImage: null,
      galleryImages: []
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: grouped }), { status: 200 })
    );
    class FileReaderStub {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(file: Blob) {
        this.result = `data:${file.type};base64,aGVsbG8=`;
        this.onload?.();
      }
    }
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("FileReader", FileReaderStub);
    const file = new File(["hello"], "avatar.png", { type: "image/png" });

    await expect(uploadProfileMedia(file, "profile")).resolves.toEqual(grouped);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/uploads/profile-media");
    expect(request).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
    expect(JSON.parse(String(request.body))).toEqual({
      role: "profile",
      fileName: "avatar.png",
      contentType: "image/png",
      fileSizeBytes: 5,
      fileDataUrl: "data:image/png;base64,aGVsbG8="
    });
  });

  it("deletes encoded media ids with session credentials", async () => {
    const grouped: TechProfileMedia = {
      profileImage: null,
      backgroundImage: null,
      galleryImages: []
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: grouped }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeProfileMedia("media/id ?")).resolves.toEqual(grouped);
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/profile-media/media%2Fid%20%3F", {
      method: "DELETE",
      credentials: "include"
    });
  });
});
