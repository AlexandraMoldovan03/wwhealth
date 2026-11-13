import type { UploadFile } from './api';
import type { LungAnalysis } from './lungvision';
import type {
  AccessGrantRequest,
  AccessGrantResponse,
  AccessRedeemRequest,
  AccessRedeemResponse,
  DocumentAnalyzeResponse,
  DocumentType,
  HealthResponse,
  PatientRecord,
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
  analyzeDocument(file: UploadFile, documentType: DocumentType, title: string): Promise<DocumentAnalyzeResponse>;
  analyzeXray(file: UploadFile): Promise<XrayAnalysis>;
  /** LungVision (real model on the backend) — POST /api/ai/lung/analyze. */
  analyzeLung(file: UploadFile): Promise<LungAnalysis>;
  grantAccess(request: AccessGrantRequest): Promise<AccessGrantResponse>;
  redeemAccess(request: AccessRedeemRequest): Promise<AccessRedeemResponse>;
  voiceSummary(request: VoiceSummaryRequest): Promise<VoiceSummaryResponse>;
}
