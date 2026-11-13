/** Browser API operations for direct profile-media uploads and removals. */
import { apiUrl, readApiResponse } from "./client";
import type { ProfileMedia, TechProfileMedia } from "./types";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Image could not be read"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image could not be read"));
    reader.readAsDataURL(file);
  });
}

export async function uploadProfileMedia(
  file: File,
  role: "profile" | "background" | "gallery"
) {
  const response = await fetch(apiUrl("/api/uploads/profile-media"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role,
      fileName: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
      fileDataUrl: await readFileAsDataUrl(file)
    })
  });
  return readApiResponse<TechProfileMedia>(response, "Image could not be uploaded");
}

export async function removeProfileMedia(mediaId: string) {
  const response = await fetch(
    apiUrl(`/api/uploads/profile-media/${encodeURIComponent(mediaId)}`),
    { method: "DELETE", credentials: "include" }
  );
  return readApiResponse<TechProfileMedia>(response, "Image could not be removed");
}
