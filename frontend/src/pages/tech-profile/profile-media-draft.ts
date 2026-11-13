/** Pure draft-state helpers that let profile media be previewed and edited before persistence. */
import type { ProfileMedia, TechProfileMedia } from "@/services/api";

export type ProfileMediaRole = "profile" | "background" | "gallery";
export type PendingMediaUpload = {
  localId: string;
  file: File;
  role: ProfileMediaRole;
  objectUrl: string;
};
export type ProfileMediaDraft = {
  savedMedia: TechProfileMedia;
  preview: TechProfileMedia;
  pendingUploads: PendingMediaUpload[];
  removedMediaIds: string[];
};
export type AddDraftResult =
  | { ok: true; draft: ProfileMediaDraft; revokedObjectUrls: string[] }
  | { ok: false; error: string };
export type RemoveDraftResult = { draft: ProfileMediaDraft; revokedObjectUrls: string[] };

const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROFILE_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 12;

export function createProfileMediaDraft(media: TechProfileMedia): ProfileMediaDraft {
  return {
    savedMedia: cloneMedia(media),
    preview: cloneMedia(media),
    pendingUploads: [],
    removedMediaIds: []
  };
}

export function addDraftMedia(
  draft: ProfileMediaDraft,
  file: File,
  role: ProfileMediaRole,
  objectUrl: string
): AddDraftResult {
  const error = validateMedia(file, role, draft.preview);
  if (error) return { ok: false, error };

  const upload: PendingMediaUpload = {
    localId: createDraftId(role),
    file,
    role,
    objectUrl
  };
  const replacedUploads = role === "gallery" ? [] : draft.pendingUploads.filter((pending) => pending.role === role);
  const pendingUploads = replaceRoleUpload(draft.pendingUploads, upload);
  const preview = updatePreview(draft.preview, upload);

  return {
    ok: true,
    draft: { savedMedia: draft.savedMedia, preview, pendingUploads, removedMediaIds: draft.removedMediaIds },
    revokedObjectUrls: replacedUploads.map((pending) => pending.objectUrl)
  };
}

export function removeDraftMedia(draft: ProfileMediaDraft, mediaId: string): RemoveDraftResult {
  const pendingUpload = draft.pendingUploads.find((upload) => upload.localId === mediaId);
  if (pendingUpload) {
    return {
      draft: {
        savedMedia: draft.savedMedia,
        preview: removePreviewMedia(draft, pendingUpload),
        pendingUploads: draft.pendingUploads.filter((upload) => upload.localId !== mediaId),
        removedMediaIds: draft.removedMediaIds
      },
      revokedObjectUrls: [pendingUpload.objectUrl]
    };
  }

  if (!hasMedia(draft.preview, mediaId)) return { draft, revokedObjectUrls: [] };

  return {
    draft: {
      savedMedia: draft.savedMedia,
      preview: removePersistedPreviewMedia(draft.preview, mediaId),
      pendingUploads: draft.pendingUploads,
      removedMediaIds: draft.removedMediaIds.includes(mediaId)
        ? draft.removedMediaIds
        : [...draft.removedMediaIds, mediaId]
    },
    revokedObjectUrls: []
  };
}

export function clearProfileMediaDraft(draft: ProfileMediaDraft): string[] {
  return draft.pendingUploads.map((upload) => upload.objectUrl);
}

export function checkpointRemovedMedia(
  draft: ProfileMediaDraft,
  mediaId: string,
  savedMedia: TechProfileMedia
): ProfileMediaDraft {
  return createCheckpointDraft(
    savedMedia,
    draft.pendingUploads,
    draft.removedMediaIds.filter((removedMediaId) => removedMediaId !== mediaId)
  );
}

export function checkpointUploadedMedia(
  draft: ProfileMediaDraft,
  localId: string,
  savedMedia: TechProfileMedia
): ProfileMediaDraft {
  return createCheckpointDraft(
    savedMedia,
    draft.pendingUploads.filter((upload) => upload.localId !== localId),
    draft.removedMediaIds
  );
}

function validateMedia(file: File, role: ProfileMediaRole, media: TechProfileMedia): string | null {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size > MAX_PROFILE_MEDIA_BYTES) return "Choose an image no larger than 10 MiB.";
  if (role === "gallery" && media.galleryImages.length >= MAX_GALLERY_IMAGES) {
    return "Work gallery is limited to 12 images.";
  }
  return null;
}

function createDraftId(role: ProfileMediaRole): string {
  return `draft-${role}-${crypto.randomUUID()}`;
}

function replaceRoleUpload(pendingUploads: PendingMediaUpload[], upload: PendingMediaUpload): PendingMediaUpload[] {
  return upload.role === "gallery"
    ? [...pendingUploads, upload]
    : [...pendingUploads.filter((pending) => pending.role !== upload.role), upload];
}

function updatePreview(media: TechProfileMedia, upload: PendingMediaUpload): TechProfileMedia {
  const draftMedia = toDraftMedia(upload, upload.role === "gallery" ? media.galleryImages.length : 0);
  if (upload.role === "gallery") return { ...media, galleryImages: [...media.galleryImages, draftMedia] };
  return upload.role === "profile"
    ? { ...media, profileImage: draftMedia }
    : { ...media, backgroundImage: draftMedia };
}

function toDraftMedia(upload: PendingMediaUpload, sortOrder: number): ProfileMedia {
  return { id: upload.localId, imageUrl: upload.objectUrl, altText: null, sortOrder };
}

function removePreviewMedia(draft: ProfileMediaDraft, upload: PendingMediaUpload): TechProfileMedia {
  if (upload.role === "gallery") return removePersistedPreviewMedia(draft.preview, upload.localId);
  return upload.role === "profile"
    ? { ...draft.preview, profileImage: restoreSavedMedia(draft, "profile") }
    : { ...draft.preview, backgroundImage: restoreSavedMedia(draft, "background") };
}

function restoreSavedMedia(draft: ProfileMediaDraft, role: "profile" | "background"): ProfileMedia | null {
  const savedMedia = role === "profile" ? draft.savedMedia.profileImage : draft.savedMedia.backgroundImage;
  return savedMedia && !draft.removedMediaIds.includes(savedMedia.id) ? savedMedia : null;
}

function hasMedia(media: TechProfileMedia, mediaId: string): boolean {
  return media.profileImage?.id === mediaId || media.backgroundImage?.id === mediaId || media.galleryImages.some((image) => image.id === mediaId);
}

function removePersistedPreviewMedia(media: TechProfileMedia, mediaId: string): TechProfileMedia {
  if (media.profileImage?.id === mediaId) return { ...media, profileImage: null };
  if (media.backgroundImage?.id === mediaId) return { ...media, backgroundImage: null };
  return { ...media, galleryImages: media.galleryImages.filter((image) => image.id !== mediaId) };
}

function cloneMedia(media: TechProfileMedia): TechProfileMedia {
  return { ...media, galleryImages: [...media.galleryImages] };
}

function createCheckpointDraft(
  savedMedia: TechProfileMedia,
  pendingUploads: PendingMediaUpload[],
  removedMediaIds: string[]
): ProfileMediaDraft {
  const checkpointMedia = cloneMedia(savedMedia);
  return {
    savedMedia: checkpointMedia,
    preview: pendingUploads.reduce((preview, upload) => updatePreview(preview, upload), cloneMedia(checkpointMedia)),
    pendingUploads,
    removedMediaIds
  };
}
