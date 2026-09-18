import type { PresignedPost } from "./types";

/** Textract wants detail (≤2400px); Claude's image limit is 3.75 MB and 1568px is its sweet spot. */
export const VARIANTS = {
  original: { edge: 2400, maxBytes: 5 * 1024 * 1024 },
  model: { edge: 1568, maxBytes: 3.75 * 1024 * 1024 },
} as const;

/**
 * Resizing happens on the phone so the backend needs no image library, and so a 12-megapixel camera
 * photo does not have to cross a village mobile connection twice.
 */
export async function toJpeg(file: File, edge: number, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("The photo is too large even after resizing.");
}

export async function upload(post: PresignedPost, blob: Blob) {
  // The local preview has no S3 bucket to upload to.
  if (post.url.startsWith("mock://")) return;
  const form = new FormData();
  for (const [key, value] of Object.entries(post.fields)) form.append(key, value);
  form.append("file", blob, "photo.jpg");
  const response = await fetch(post.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}

/** Both variants, model first: the extractor starts when original.jpg lands. */
export async function uploadBoth(uploads: { model: PresignedPost; original: PresignedPost }, file: File) {
  await upload(uploads.model, await toJpeg(file, VARIANTS.model.edge, VARIANTS.model.maxBytes));
  await upload(uploads.original, await toJpeg(file, VARIANTS.original.edge, VARIANTS.original.maxBytes));
}
