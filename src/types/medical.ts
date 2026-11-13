/**
 * DOMAIN + API CONTRACT TYPES — mirror of docs/API_CONTRACT.md.
 * JSON is camelCase on the wire. Dates are ISO 8601 strings.
 * If you change a type here, change the backend schema and the contract doc too.
 */

export type Sex = 'female' | 'male' | 'other';
export type Severity = 'mild' | 'moderate' | 'severe';

export interface Allergy {
  id: string;
  substance: string;
  reaction: string;
  severity: Severity;
}

export interface Diagnosis {
  id: string;
  name: string;
  icd10: string | null;
  diagnosedAt: string;
  status: 'active' | 'resolved';
}

export interface Treatment {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface PatientProfile {
  id: string;
  fullName: string;
  dateOfBirth: string;
  sex: Sex;
  bloodType: string | null;
  heightCm: number | null;
  weightKg: number | null;
  emergencyContact: EmergencyContact | null;
  allergies: Allergy[];
  diagnoses: Diagnosis[];
  treatments: Treatment[];
}

export type MedicalEventType = 'diagnosis' | 'treatment' | 'allergy' | 'document' | 'xray' | 'visit';

export interface MedicalEvent {
  id: string;
  type: MedicalEventType;
  title: string;
  description: string;
  date: string;
  details: Record<string, string>;
}

export type DocumentType = 'lab_result' | 'prescription' | 'discharge_summary' | 'imaging_report' | 'other';

export interface LabValue {
  name: string;
  value: string;
  unit: string | null;
  flag: 'low' | 'normal' | 'high' | null;
}

/** What Gemini extracts from a document (backend). */
export interface DocumentExtraction {
  summary: string;
  diagnoses: string[];
  allergies: string[];
  medications: string[];
  labValues: LabValue[];
}

export interface MedicalDocument {
  id: string;
  title: string;
  type: DocumentType;
  uploadedAt: string;
  fileUrl: string | null;
  status: 'processing' | 'analyzed' | 'failed';
  extraction: DocumentExtraction | null;
  isDemo: boolean;
}

export interface XrayPrediction {
  label: string;
  probability: number; // 0..1
}

/** LungVision result (DenseNet121 + Grad-CAM). */
export interface XrayAnalysis {
  id: string;
  createdAt: string;
  imageUrl: string | null;
  /** Grad-CAM overlay (URL or data URI). null until the AI model is integrated. */
  heatmapUrl: string | null;
  predictions: XrayPrediction[];
  topLabel: string;
  modelVersion: string;
  processingTimeMs: number;
  isDemo: boolean;
  disclaimer: string;
}

/** Everything the patient (or an authorised doctor) can see. */
export interface PatientRecord extends PatientProfile {
  history: MedicalEvent[];
  documents: MedicalDocument[];
  xrays: XrayAnalysis[];
}

export type AccessScope = 'profile' | 'history' | 'documents' | 'xrays';

// ---------- Requests / responses ----------

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface DocumentAnalyzeResponse {
  document: MedicalDocument;
}

export interface AccessGrantRequest {
  scopes: AccessScope[];
  ttlMinutes: number;
}

export interface AccessGrantResponse {
  token: string;
  /** String to encode in the QR code (e.g. "wwhealth://access/<token>"). */
  qrPayload: string;
  expiresAt: string;
  scopes: AccessScope[];
}

export interface AccessRedeemRequest {
  token: string;
}

export interface AccessRedeemResponse {
  accessId: string;
  expiresAt: string;
  scopes: AccessScope[];
  /** Filtered by scopes: arrays outside the granted scopes are empty. */
  patient: PatientRecord;
}

export interface VoiceSummaryRequest {
  patientId: string;
  language: 'en' | 'ro';
}

export interface VoiceSummaryResponse {
  text: string;
  /** ElevenLabs audio (URL). null in MOCK mode / until integrated. */
  audioUrl: string | null;
  isDemo: boolean;
}
