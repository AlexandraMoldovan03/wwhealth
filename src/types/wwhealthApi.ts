import type { UploadFile } from './api';
import type { LabExtractionResponse, LabValueEntry, PatientLabValue } from './labs';
import type { EmergencyAccessEvent, EmergencyData, EmergencyRedeemRequest, EmergencyTokenResponse } from './emergency';
import type { LungAnalysis } from './lungvision';
import type {
  AccessGrantRequest,
  AccessGrantResponse,
  AccessRedeemRequest,
  AccessRedeemResponse,
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
 * Implemented twice: `realApi` (HTTP) and `mockApi` (in-memory). See src/services/backend.ts.
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
  /** LungVision (real model on the backend) — POST /api/ai/lung/analyze. */
  analyzeLung(file: UploadFile): Promise<LungAnalysis>;
  grantAccess(request: AccessGrantRequest): Promise<AccessGrantResponse>;
  redeemAccess(request: AccessRedeemRequest): Promise<AccessRedeemResponse>;
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
  redeemEmergencyToken(request: EmergencyRedeemRequest): Promise<EmergencyData>;
  getEmergencyAudit(): Promise<EmergencyAccessEvent[]>;
  /** Doctor: own emergency scans (opened / refused). */
  getMyEmergencyAccesses(): Promise<EmergencyAccessEvent[]>;
}
