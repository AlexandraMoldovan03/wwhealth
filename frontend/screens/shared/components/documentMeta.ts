import type { DocumentType, IconName } from '@/types';

export const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: IconName }[] = [
  { value: 'lab_result', label: 'Lab result', icon: 'flask-outline' },
  { value: 'prescription', label: 'Prescription', icon: 'medkit-outline' },
  { value: 'discharge_summary', label: 'Discharge summary', icon: 'document-text-outline' },
  { value: 'imaging_report', label: 'Imaging report', icon: 'images-outline' },
  { value: 'other', label: 'Other', icon: 'document-outline' },
];

export function getDocumentMeta(type: DocumentType) {
  return DOCUMENT_TYPES.find((t) => t.value === type) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}
