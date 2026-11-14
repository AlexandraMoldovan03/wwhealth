import type { UploadFile } from './api';
import type { IntakeForm } from './intake';
import type { AccessOverview, DoctorGrant, DoctorIdentity, DoctorPatient, GrantRequest, MedicalSummary, PatientAccessView, VerifiedDoctor } from './consent';
import type { AiConsent, IntelligenceView } from './intelligence';
import type { LabExtractionResponse, LabValueEntry, PatientLabValue } from './labs';
import type { EmergencyAccessEvent, EmergencyData, EmergencyRedeemRequest, EmergencyTokenResponse, EmergencyTokenStatus } from './emergency';
import type { LungAnalysis } from './lungvision';
import type {
  DocumentAnalyzeResponse,
  DocumentType,
  DocumentUploadResponse,
  HealthResponse,
  PatientRecord,
  ProfileUpdate,
  VoiceSummaryRequest,
  VoiceSummaryResponse,
  XrayAnalysis,
} from './medical';

/**
 * The single interface the UI uses to talk to the backend.
 * Implemented twice: `realApi` (HTTP) and `mockApi` (in-memory). See frontend/services/backend.ts.
 */
export interface WWHealthApi {
  health(): Promise<HealthResponse>;
  getMyPatient(): Promise<PatientRecord>;
  /** Blood type, allergies, conditions, medication. */
  updateMyProfile(update: ProfileUpdate): Promise<PatientRecord>;
  /** Private upload, no OCR / AI. */
  uploadDocument(file: UploadFile, documentType: DocumentType, title: string): Promise<DocumentUploadResponse>;
  analyzeDocument(file: UploadFile, documentType: DocumentType, title: string): Promise<DocumentAnalyzeResponse>;
  analyzeXray(file: UploadFile): Promise<XrayAnalysis>;
  analyzeIntake(file: UploadFile): Promise<IntakeForm>;
  /** LungVision (real model on the backend) — POST /api/ai/lung/analyze. */
  analyzeLung(file: UploadFile): Promise<LungAnalysis>;
  voiceSummary(request: VoiceSummaryRequest): Promise<VoiceSummaryResponse>;
  // Document scanner (digital PDFs, local extraction on our server)
  extractLabValues(file: UploadFile): Promise<LabExtractionResponse>;
  getLabValues(documentId: string): Promise<LabValueEntry[]>;
  saveLabValues(documentId: string, values: LabValueEntry[]): Promise<LabValueEntry[]>;
  /** Re-reads an already uploaded document (PDF text / OCR). */
  extractLabValuesFromDocument(documentId: string): Promise<LabExtractionResponse>;
  /** Every confirmed value of the patient, across documents. */
  listLabValues(): Promise<PatientLabValue[]>;
  // Emergency Medical Passport
  createEmergencyToken(): Promise<EmergencyTokenResponse>;
  revokeEmergencyToken(tokenId: string): Promise<void>;
  getEmergencyTokenStatus(tokenId: string): Promise<EmergencyTokenStatus>;
  redeemEmergencyToken(request: EmergencyRedeemRequest): Promise<EmergencyData>;
  getEmergencyAudit(): Promise<EmergencyAccessEvent[]>;
  /** Doctor: own emergency scans (opened / refused). */
  getMyEmergencyAccesses(): Promise<EmergencyAccessEvent[]>;
  // Doctor Access & Consent — patient side (own data only)
  /** Patient's own structured summary (same view a doctor gets with every section shared). */
  getMySummary(): Promise<MedicalSummary>;
  searchDoctors(query: string): Promise<VerifiedDoctor[]>;
  getDoctorAccess(): Promise<AccessOverview>;
  grantDoctorAccess(request: GrantRequest): Promise<DoctorGrant>;
  revokeDoctorAccess(grantId: string): Promise<void>;
  // Doctor side (doctor role + valid consent, enforced on the server)
  getDoctorIdentity(): Promise<DoctorIdentity>;
  listDoctorPatients(query?: string): Promise<DoctorPatient[]>;
  openDoctorPatient(patientId: string): Promise<PatientAccessView>;

  // AI Medical Intelligence (Gemini on the server, explicit patient consent, sources checked)
  getAiConsent(): Promise<AiConsent>;
  setAiConsent(granted: boolean): Promise<AiConsent>;
  getMyIntelligence(): Promise<IntelligenceView>;
  generateMyIntelligence(language: 'ro' | 'en'): Promise<IntelligenceView>;
  deleteMyIntelligence(): Promise<void>;
  /** Doctor: saved summary only with a valid consent covering every section it was built from. */
  getPatientIntelligence(patientId: string): Promise<IntelligenceView>;
  /** Doctor: from the granted sections only; not stored. */
  generatePatientIntelligence(patientId: string, language: 'ro' | 'en'): Promise<IntelligenceView>;
}
