import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { USE_MOCKS } from '@/config/config';
import { ApiError } from '@/services/api/ApiError';
import { getAuthHeaders, resolveApiUrl } from '@/services/api/client';

export type ExportKind = 'fhir' | 'emergency-summary' | 'labs.csv' | 'summary.pdf' | 'archive.zip';

export const EXPORT_FILES: Record<ExportKind, { filename: string; mimeType: string }> = {
  fhir: { filename: 'wwhealth-fhir.json', mimeType: 'application/fhir+json' },
  'emergency-summary': { filename: 'wwhealth-emergency-summary.json', mimeType: 'application/fhir+json' },
  'labs.csv': { filename: 'wwhealth-analize.csv', mimeType: 'text/csv' },
  'summary.pdf': { filename: 'wwhealth-rezumat.pdf', mimeType: 'application/pdf' },
  'archive.zip': { filename: 'wwhealth-export.zip', mimeType: 'application/zip' },
};

/** Own export, or (doctor) the export of a patient who granted access. The backend enforces consent. */
export const exportPath = (kind: ExportKind, patientId?: string) =>
  patientId
    ? `/api/v1/care/doctor/patients/${encodeURIComponent(patientId)}/export/${kind}`
    : `/api/v1/care/export/${kind}`;

/**
 * Downloads an export with the user's session and opens the share sheet (native) or saves it (web).
 * The file stays in the app cache; nothing is uploaded anywhere else.
 */
export async function downloadAndShare(kind: ExportKind, patientId?: string): Promise<void> {
  if (USE_MOCKS) throw new ApiError('Export is available with the WWHealth server only.', 503);
  const { filename, mimeType } = EXPORT_FILES[kind];
  const url = resolveApiUrl(exportPath(kind, patientId));
  const headers = await getAuthHeaders();

  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new ApiError(`Export failed (${res.status})`, res.status);
    const blob = URL.createObjectURL(await res.blob());
    const a = globalThis.document.createElement('a');
    a.href = blob;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
    return;
  }

  const target = new File(Paths.cache, filename);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
  if (!(await Sharing.isAvailableAsync())) throw new ApiError('Sharing is not available on this device.', 501);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: kind === 'summary.pdf' ? 'com.adobe.pdf' : undefined });
}
