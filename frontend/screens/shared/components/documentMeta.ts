import type { DocumentType, IconName } from '@/types';

/** Types offered by the classic upload form. */
export const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: IconName }[] = [
  { value: 'lab_result', label: 'Lab result', icon: 'flask-outline' },
  { value: 'prescription', label: 'Prescription', icon: 'medkit-outline' },
  { value: 'discharge_summary', label: 'Discharge summary', icon: 'document-text-outline' },
  { value: 'imaging_report', label: 'Imaging report', icon: 'images-outline' },
  { value: 'other', label: 'Other', icon: 'document-outline' },
];

/** Every category a document can have (Smart Import can also detect these). */
export const ALL_DOCUMENT_TYPES: { value: DocumentType; label: string; icon: IconName }[] = [
  ...DOCUMENT_TYPES.slice(0, 4),
  { value: 'consultation', label: 'Consultation', icon: 'chatbubbles-outline' },
  { value: 'trauma', label: 'Accident / trauma', icon: 'bandage-outline' },
  { value: 'surgery', label: 'Surgery', icon: 'cut-outline' },
  { value: 'vaccination', label: 'Vaccination', icon: 'shield-checkmark-outline' },
  DOCUMENT_TYPES[4],
];

export function getDocumentMeta(type: DocumentType) {
  return ALL_DOCUMENT_TYPES.find((t) => t.value === type) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}
