/** Prioritised Emergency Passport + document summary — mirror of backend/app/schemas/emergency_passport.py. */

export type PassportItemKind =
  | 'allergy' | 'condition' | 'medication' | 'lab' | 'blood_type' | 'history' | 'procedure' | 'finding' | 'recommendation';
export type LabStatus = 'low' | 'high' | 'normal' | 'unknown';

export interface PassportSource {
  kind: 'profile' | 'document' | 'lab';
  documentId: string | null;
  documentTitle: string | null;
  date: string | null;
  page: number | null;
  excerpt: string | null;
}

export interface LabReading {
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: LabStatus;
  critical: boolean;
  date: string | null;
  previous: { value: string; date: string | null }[];
}

export interface PassportItem {
  key: string;
  kind: PassportItemKind;
  label: string;
  detail: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  status: string | null;
  /** Rule codes explaining the priority (translated with passport.flags.*). */
  flags: string[];
  confirmed: boolean;
  conflict: boolean;
  conflictValues: string[];
  lab: LabReading | null;
  sources: PassportSource[];
}

export interface PrioritizedPassport {
  allergiesStatus: 'known' | 'unknown';
  critical: PassportItem[];
  essential: PassportItem[];
  investigations: PassportItem[];
  normalLabs: PassportItem[];
  conflicts: number;
  unconfirmed: number;
}

export interface DocumentSummary {
  documentId: string;
  documentType: string;
  date: string | null;
  findings: PassportItem[];
  abnormalLabs: PassportItem[];
  normalLabsCount: number;
  diagnoses: PassportItem[];
  treatment: PassportItem[];
  emergencyRelevant: PassportItem[];
  needsConfirmation: number;
}
