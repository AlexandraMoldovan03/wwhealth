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

/** Surgical history. date: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' — as precise as the patient knows it. */
export interface Surgery {
  id: string;
  name: string;
  date: string | null;
  notes: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface PatientProfile {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  sex: Sex | null;
  bloodType: string | null;
  heightCm: number | null;
  weightKg: number | null;
  emergencyContact: EmergencyContact | null;
  allergies: Allergy[];
  diagnoses: Diagnosis[];
  treatments: Treatment[];
  /** Missing on servers without migration 20261116000000. */
  surgeries?: Surgery[];
}

/** 'lab' = confirmed lab values of a document (built in the app from GET /documents/lab-values). */
export type MedicalEventType = 'diagnosis' | 'treatment' | 'allergy' | 'document' | 'xray' | 'visit' | 'lab';

export interface MedicalEvent {
  id: string;
  type: MedicalEventType;
  title: string;
  description: string;
  date: string;
  details: Record<string, string>;
  /** Set for type 'document' — opens the uploaded file. */
  documentId?: string | null;
}

export type DocumentType = 'lab_result' | 'prescription' | 'discharge_summary' | 'imaging_report' | 'other'
  // Smart Import categories
  | 'consultation' | 'trauma' | 'surgery' | 'vaccination';

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
  /** API path (needs auth), e.g. /api/v1/documents/{id}/file. Local file URI in MOCK mode. */
  fileUrl: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status: 'uploaded' | 'processing' | 'analyzed' | 'failed';
  extraction: DocumentExtraction | null;
  isDemo: boolean;
  /** Smart Import metadata (absent for older documents). */
  originalFilename?: string | null;
  specialty?: string | null;
  eventDate?: string | null;
  documentDate?: string | null;
  institution?: string | null;
  processingStatus?: 'uploaded' | 'processing' | 'needs_review' | 'confirmed' | 'failed' | null;
  importId?: string | null;
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

// ---------- Requests / responses ----------

export interface HealthResponse {
  status: 'ok';
  version: string;
  /** "supabase" = shared database; "demo" = in-memory on that server only (nothing syncs between phones). */
  dataMode?: 'supabase' | 'demo';
  /** Supabase project ref the server uses — must match the app's EXPO_PUBLIC_SUPABASE_URL. */
  supabaseProject?: string | null;
}

export interface DocumentAnalyzeResponse {
  document: MedicalDocument;
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

// ---------- Smart Medical Profile ----------

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

/** Items without `id` are new; the backend assigns ids. */
export interface AllergyInput {
  id?: string;
  substance: string;
  reaction: string;
  severity: Severity;
}

export interface DiagnosisInput {
  id?: string;
  name: string;
  icd10?: string | null;
  diagnosedAt?: string | null;
  status: 'active' | 'resolved';
}

export interface TreatmentInput {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
}

export interface SurgeryInput {
  id?: string;
  name: string;
  date?: string | null;
  notes?: string;
}

/** PATCH /api/v1/patients/me — only the fields sent are changed; lists replace the whole list. */
export interface ProfileUpdate {
  fullName?: string;
  /** YYYY-MM-DD */
  dateOfBirth?: string | null;
  sex?: Sex | null;
  heightCm?: number | null;
  weightKg?: number | null;
  emergencyContact?: EmergencyContact | null;
  bloodType?: BloodType | null;
  allergies?: AllergyInput[];
  diagnoses?: DiagnosisInput[];
  treatments?: TreatmentInput[];
  surgeries?: SurgeryInput[];
}

/** POST /api/v1/documents (PDF / JPEG / PNG, no OCR). */
export interface DocumentUploadResponse {
  document: MedicalDocument;
}
