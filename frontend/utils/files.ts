import type { UploadFile } from '@/types';

/** Guesses the MIME type from the file extension (fallback: JPEG). */
export function guessMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}

/** Builds an UploadFile from a local URI (e.g. from expo-image-picker). */
export function toUploadFile(uri: string, fallbackName = 'upload.jpg'): UploadFile {
  const name = uri.split('/').pop() || fallbackName;
  return { uri, name, type: guessMimeType(uri) };
}
