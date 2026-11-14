import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import type { UploadFile } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { i18n } from '@/i18n';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // same limit as the backend
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
/** Smart Import also reads FHIR R4 (JSON / NDJSON) and CSV — parsed on the server, never executed. */
export const STRUCTURED_MIME_TYPES = ['application/json', 'application/fhir+json', 'application/x-ndjson', 'text/csv',
  'text/comma-separated-values', 'application/csv', 'text/plain'];

export interface PickedDocument extends UploadFile {
  size: number | null;
  isPdf: boolean;
  /** FHIR JSON / NDJSON / CSV (Smart Import only). */
  isStructured: boolean;
}

function guessType(name: string, mime?: string | null): string {
  const ext = name.split('.').pop()?.toLowerCase();
  // Pickers often report JSON / CSV as text/plain or octet-stream: the extension decides for those.
  if (ext === 'json') return 'application/json';
  if (ext === 'ndjson') return 'application/x-ndjson';
  if (ext === 'csv') return 'text/csv';
  if (mime) return mime === 'image/jpg' ? 'image/jpeg' : mime;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
}

/** Pick a medical document: PDF/image from Files, a photo from the gallery, or the camera. Checks type and size. */
export function useDocumentPicker({ structured = false }: { structured?: boolean } = {}) {
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const accept = useCallback((uri: string, name: string, mime: string | null | undefined, size: number | null | undefined) => {
    const type = guessType(name, mime);
    const isStructured = STRUCTURED_MIME_TYPES.includes(type);
    if (!DOCUMENT_MIME_TYPES.includes(type) && !(structured && isStructured)) {
      setPickError(i18n.t('upload.errors.type'));
      return;
    }
    if (size && size > MAX_DOCUMENT_BYTES) {
      setPickError(i18n.t('upload.errors.size'));
      return;
    }
    setFile({ uri, name, type, size: size ?? null, isPdf: type === 'application/pdf', isStructured });
    setPickError(null);
  }, [structured]);

  const pickFile = useCallback(async () => {
    try {
      const types = structured ? [...DOCUMENT_MIME_TYPES, ...STRUCTURED_MIME_TYPES, 'application/octet-stream'] : DOCUMENT_MIME_TYPES;
      const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      accept(a.uri, a.name, a.mimeType, a.size);
    } catch (err) {
      setPickError(getErrorMessage(err));
    }
  }, [accept]);

  const fromImageResult = useCallback(
    (res: ImagePicker.ImagePickerResult) => {
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      accept(a.uri, a.fileName ?? a.uri.split('/').pop() ?? 'document.jpg', a.mimeType, a.fileSize);
    },
    [accept],
  );

  const pickPhoto = useCallback(async () => {
    try {
      // quality < 1 makes iOS return JPEG instead of HEIC.
      fromImageResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));
    } catch (err) {
      setPickError(getErrorMessage(err));
    }
  }, [fromImageResult]);

  const takePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPickError(i18n.t('upload.errors.camera'));
        return;
      }
      fromImageResult(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }));
    } catch (err) {
      setPickError(getErrorMessage(err));
    }
  }, [fromImageResult]);

  const clear = useCallback(() => {
    setFile(null);
    setPickError(null);
  }, []);

  return { file, pickError, pickFile, pickPhoto, takePhoto, clear };
}
