import { describe, expect, it } from "vitest";
import {
  addDraftMedia,
  checkpointRemovedMedia,
  checkpointUploadedMedia,
  clearProfileMediaDraft,
  createProfileMediaDraft,
  removeDraftMedia
} from "../profile-media-draft";

const savedMedia = {
  profileImage: { id: "profile-saved", imageUrl: "profile.jpg", altText: null, sortOrder: 0 },
  backgroundImage: { id: "background-saved", imageUrl: "background.jpg", altText: null, sortOrder: 0 },
  galleryImages: [{ id: "gallery-saved", imageUrl: "gallery.jpg", altText: null, sortOrder: 0 }]
};
const pngFile = new File(["avatar"], "avatar.png", { type: "image/png" });

describe("profile media drafts", () => {
  it("previews a selected profile image without queuing a delete", () => {
    const result = addDraftMedia(createProfileMediaDraft(savedMedia), pngFile, "profile", "blob:avatar");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    expect(result.draft.preview.profileImage).toMatchObject({ imageUrl: "blob:avatar" });
    expect(result.draft.pendingUploads).toEqual([expect.objectContaining({ file: pngFile, role: "profile" })]);
    expect(result.draft.removedMediaIds).toEqual([]);
  });

  it("queues removal only for persisted media", () => {
    expect(removeDraftMedia(createProfileMediaDraft(savedMedia), "gallery-saved").draft.removedMediaIds).toEqual([
      "gallery-saved"
    ]);

    const added = addDraftMedia(createProfileMediaDraft(savedMedia), pngFile, "gallery", "blob:gallery");
    if (!added.ok) throw new Error(added.error);
    const removed = removeDraftMedia(added.draft, added.draft.pendingUploads[0].localId);
    expect(removed.draft.pendingUploads).toHaveLength(0);
    expect(removed.draft.removedMediaIds).toEqual([]);
    expect(removed.revokedObjectUrls).toEqual(["blob:gallery"]);
  });

  it("replaces a pending role upload and revokes its obsolete object URL", () => {
    const first = addDraftMedia(createProfileMediaDraft(savedMedia), pngFile, "background", "blob:first");
    if (!first.ok) throw new Error(first.error);
    const second = addDraftMedia(first.draft, pngFile, "background", "blob:second");

    expect(second).toMatchObject({ ok: true, revokedObjectUrls: ["blob:first"] });
    if (!second.ok) throw new Error(second.error);
    expect(second.draft.pendingUploads).toEqual([expect.objectContaining({ objectUrl: "blob:second" })]);
  });

  it.each([
    ["profile" as const, "profileImage" as const, "profile-saved"],
    ["background" as const, "backgroundImage" as const, "background-saved"]
  ])("restores the saved %s preview when its pending replacement is removed", (role, field, savedId) => {
    const added = addDraftMedia(createProfileMediaDraft(savedMedia), pngFile, role, `blob:${role}`);
    if (!added.ok) throw new Error(added.error);

    const removed = removeDraftMedia(added.draft, added.draft.pendingUploads[0].localId);

    expect(removed.draft.preview[field]).toMatchObject({ id: savedId });
    expect(removed.draft.removedMediaIds).toEqual([]);
    expect(removed.revokedObjectUrls).toEqual([`blob:${role}`]);
  });

  it.each([
    ["profile" as const, "profileImage" as const, "profile-saved"],
    ["background" as const, "backgroundImage" as const, "background-saved"]
  ])("keeps the %s preview empty when its saved image remains queued for deletion", (role, field, savedId) => {
    const deleted = removeDraftMedia(createProfileMediaDraft(savedMedia), savedId);
    const added = addDraftMedia(deleted.draft, pngFile, role, `blob:${role}`);
    if (!added.ok) throw new Error(added.error);

    const discarded = removeDraftMedia(added.draft, added.draft.pendingUploads[0].localId);

    expect(discarded.draft.preview[field]).toBeNull();
    expect(discarded.draft.removedMediaIds).toEqual([savedId]);
    expect(discarded.revokedObjectUrls).toEqual([`blob:${role}`]);
  });

  it("copies the outer saved media state for draft previews", () => {
    const draft = createProfileMediaDraft(savedMedia);

    expect(draft.preview).not.toBe(savedMedia);
    expect(draft.preview.galleryImages).not.toBe(savedMedia.galleryImages);
  });

  it("rejects invalid files before changing the draft", () => {
    const draft = createProfileMediaDraft(savedMedia);
    const invalid = addDraftMedia(draft, new File(["gif"], "avatar.gif", { type: "image/gif" }), "profile", "blob:gif");
    const oversized = addDraftMedia(
      draft,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
      "profile",
      "blob:large"
    );

    expect(invalid).toEqual({ ok: false, error: "Choose a JPEG, PNG, or WebP image." });
    expect(oversized).toEqual({ ok: false, error: "Choose an image no larger than 10 MiB." });
  });

  it("rejects a gallery upload when the preview already has twelve images", () => {
    const draft = createProfileMediaDraft({
      profileImage: null,
      backgroundImage: null,
      galleryImages: Array.from({ length: 12 }, (_, index) => ({
        id: `gallery-${index}`,
        imageUrl: `${index}.jpg`,
        altText: null,
        sortOrder: index
      }))
    });

    expect(addDraftMedia(draft, pngFile, "gallery", "blob:overflow")).toEqual({
      ok: false,
      error: "Work gallery is limited to 12 images."
    });
  });

  it("returns every pending object URL when the draft is cleared", () => {
    const profile = addDraftMedia(createProfileMediaDraft(savedMedia), pngFile, "profile", "blob:profile");
    if (!profile.ok) throw new Error(profile.error);
    const gallery = addDraftMedia(profile.draft, pngFile, "gallery", "blob:gallery");
    if (!gallery.ok) throw new Error(gallery.error);

    expect(clearProfileMediaDraft(gallery.draft)).toEqual(["blob:profile", "blob:gallery"]);
  });

  it("keeps only unsaved work queued when a later upload fails and save is retried", () => {
    const removal = removeDraftMedia(createProfileMediaDraft(savedMedia), "gallery-saved");
    const firstGallery = addDraftMedia(removal.draft, pngFile, "gallery", "blob:first-gallery");
    if (!firstGallery.ok) throw new Error(firstGallery.error);
    const secondGallery = addDraftMedia(firstGallery.draft, pngFile, "gallery", "blob:second-gallery");
    if (!secondGallery.ok) throw new Error(secondGallery.error);

    const afterDelete = checkpointRemovedMedia(secondGallery.draft, "gallery-saved", {
      profileImage: savedMedia.profileImage,
      backgroundImage: savedMedia.backgroundImage,
      galleryImages: []
    });
    const afterFirstUpload = checkpointUploadedMedia(afterDelete, firstGallery.draft.pendingUploads[0].localId, {
      profileImage: savedMedia.profileImage,
      backgroundImage: savedMedia.backgroundImage,
      galleryImages: [{ id: "gallery-uploaded", imageUrl: "uploaded.jpg", altText: null, sortOrder: 0 }]
    });

    expect(afterFirstUpload.removedMediaIds).toEqual([]);
    expect(afterFirstUpload.pendingUploads).toEqual([
      expect.objectContaining({ localId: secondGallery.draft.pendingUploads[1].localId, objectUrl: "blob:second-gallery" })
    ]);
    expect(afterFirstUpload.preview.galleryImages).toEqual([
      expect.objectContaining({ id: "gallery-uploaded" }),
      expect.objectContaining({ id: secondGallery.draft.pendingUploads[1].localId, imageUrl: "blob:second-gallery" })
    ]);
  });
});
