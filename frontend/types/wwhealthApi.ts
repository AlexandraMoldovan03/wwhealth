import type { VoiceTranslation } from './intake';
import type { UploadFile } from './api';
import type { IntakeForm } from './intake';
import type { AccessOverview, DoctorGrant, DoctorIdentity, DoctorPatient, GrantRequest, MedicalSummary, PatientAccessView, VerifiedDoctor } from './consent';
import type { AiConsent, IntelligenceView } from './intelligence';
import type {
  Appointment,
  AppointmentRequest,
  AvailabilityCreate,
  CareDoctor,
  DoctorAppointmentAction,
  Language,
  PatientAppointmentAction,
  Slot,
  Specialty,
  TriageRequest,
  TriageResult,
  Transcript,
} from './smartCare';
import type {
  CareInsights,
  ConsultationSheet,
  DoctorAgenda,
  DoctorSchedule,
  DoseEvent,
  DoseSchedule,
  OrganizedRecord,
  Preparation,
  PreparationInput,
  RecordView,
  ScheduleSaveResult,
  TimeOff,
  TimeOffCreate,
  TimeOffResult,
  TreatmentCreate,
  TreatmentOverview,
  TreatmentPlan,
  TreatmentUpdate,
} from './careJourney';
import type { LabExtractionResponse, LabValueEntry, PatientLabValue } from './labs';
import type { AiUsageSummary, CsvMapping, DocumentDetail, DocumentUpdate, ImportConfirm, ImportPreview, LibraryPage, LibraryQuery } from './smartImport';
import type { EmergencyAccessEvent, EmergencyData, EmergencyRedeemRequest, EmergencyTokenResponse, EmergencyTokenStatus } from './emergency';
import type { GuardianEmergencyView, GuardianInviteRequest, GuardianOverview } from './emergencyGuardians';
import type { DocumentSummary, PrioritizedPassport } from './emergencyPassport';
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
  /** Voice intake: transcript in the spoken language + form and translation in the app language. */
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
  // Emergency guardians (family members linked to the emergency passport, confirmed by the invited account)
  /** My guardians (patient) + invitations sent to me + people I am an emergency contact for. */
  getEmergencyGuardians(): Promise<GuardianOverview>;
  /** Patient: what a doctor would see, prioritised, with sources / conflicts / "needs confirmation". null in MOCK. */
  getEmergencyPassportPreview(): Promise<PrioritizedPassport | null>;
  /** Structured summary of one of my documents (no AI prose). null in MOCK. */
  getDocumentSummary(documentId: string): Promise<DocumentSummary | null>;
  inviteEmergencyGuardian(request: GuardianInviteRequest): Promise<{ id: string }>;
  /** Patient: remove a guardian or cancel an invitation. */
  revokeEmergencyGuardian(id: string): Promise<void>;
  /** Guardian: accept / decline an invitation (decline also stops an active link). */
  respondEmergencyGuardian(id: string, accept: boolean): Promise<void>;
  /** Guardian: ONLY the patient's emergency data (audited). */
  getGuardianEmergencyView(patientId: string): Promise<GuardianEmergencyView>;
  /** Guardian: the patient's 5-minute single-use QR, for a doctor to scan. */
  createGuardianEmergencyToken(patientId: string): Promise<EmergencyTokenResponse>;
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

  // Smart Care — specialties (backend catalog), AI recommendation, verified doctors' calendar, appointments
  listSpecialties(query: string, language: Language): Promise<Specialty[]>;
  /** Voice → text with ElevenLabs only, after the patient's explicit confirmation. */
  transcribeSymptoms(file: UploadFile): Promise<Transcript>;
  /** Gemini translation of a voice transcript into the app language (explicit tap). */
  translateTranscript(text: string, sourceLanguage: string | null): Promise<VoiceTranslation>;
  /** Emergency rules first (no AI); Gemini only with AI consent. Not stored. */
  triageSymptoms(request: TriageRequest): Promise<TriageResult>;
  listSpecialtyDoctors(specialtyId: string): Promise<CareDoctor[]>;
  listDoctorSlots(doctorId: string): Promise<Slot[]>;
  requestAppointment(request: AppointmentRequest, language: Language): Promise<Appointment>;
  listMyAppointments(language: Language): Promise<Appointment[]>;
  updateMyAppointment(appointmentId: string, action: PatientAppointmentAction, language: Language): Promise<Appointment>;
  /** Doctor: requests addressed to them. */
  listDoctorAppointments(language: Language): Promise<Appointment[]>;
  respondAppointment(appointmentId: string, action: DoctorAppointmentAction, language: Language): Promise<Appointment>;
  /** Doctor: own future slots (free or booked). */
  listMyAvailability(): Promise<Slot[]>;
  /** Doctor: own free slots (to propose another time). */
  listMyFreeSlots(): Promise<Slot[]>;
  addAvailability(request: AvailabilityCreate): Promise<{ added: number }>;
  deleteAvailability(slotId: string): Promise<void>;

  // Care Journey — doctor (role + consent checked on the server and by Postgres)
  getMySchedule(): Promise<DoctorSchedule>;
  saveMySchedule(schedule: DoctorSchedule): Promise<ScheduleSaveResult>;
  listMyTimeOff(): Promise<TimeOff[]>;
  addTimeOff(request: TimeOffCreate): Promise<TimeOffResult>;
  deleteTimeOff(id: string): Promise<void>;
  getAgenda(fromIso: string, toIso: string, language: Language): Promise<DoctorAgenda>;
  getConsultation(appointmentId: string, language: Language): Promise<ConsultationSheet>;
  listPatientTreatments(patientId: string): Promise<TreatmentPlan[]>;
  createTreatment(request: TreatmentCreate): Promise<TreatmentPlan>;
  updateTreatment(planId: string, request: TreatmentUpdate): Promise<TreatmentPlan>;
  endTreatment(planId: string, status: 'discontinued' | 'cancelled', reason: string | null): Promise<TreatmentPlan>;
  getPatientRecordView(patientId: string, view: RecordView, appointmentId: string | null, language: Language): Promise<OrganizedRecord>;
  getPatientInsights(patientId: string, language: Language, reason: string | null): Promise<CareInsights>;
  // Care Journey — patient
  getPreparation(appointmentId: string): Promise<Preparation | null>;
  savePreparation(appointmentId: string, body: PreparationInput): Promise<Preparation>;
  getMyTreatments(timezone: string): Promise<TreatmentOverview>;
  getMyTreatment(planId: string): Promise<TreatmentPlan>;
  getReminderSchedule(timezone: string): Promise<DoseSchedule>;
  markDose(planId: string, scheduledFor: string, status: 'taken' | 'skipped', timezone: string): Promise<DoseEvent>;
  getMyRecordView(view: RecordView, appointmentId: string | null, language: Language): Promise<OrganizedRecord>;
  getMyInsights(language: Language, reason: string | null): Promise<CareInsights>;
  /** FHIR R4 Bundle (JSON) of the patient's own data. */
  exportMyFhir(): Promise<Record<string, unknown>>;

  // Universal Smart Import (preview → confirm) and Document Library. Opening them never calls Gemini.
  /** PDF / image / FHIR JSON / NDJSON / CSV → preview. Nothing is integrated before confirmImport. */
  createImport(file: UploadFile, csvMapping?: CsvMapping | null): Promise<ImportPreview>;
  getImport(importId: string): Promise<ImportPreview>;
  confirmImport(importId: string, body: ImportConfirm): Promise<ImportPreview>;
  rejectImport(importId: string): Promise<ImportPreview>;
  /** Explicit request only (may use Gemini with the patient's AI consent). */
  reanalyzeImport(importId: string): Promise<ImportPreview>;
  getAiUsage(): Promise<AiUsageSummary>;
  getLibrary(query: LibraryQuery): Promise<LibraryPage>;
  getLibraryDocument(documentId: string): Promise<DocumentDetail>;
  updateLibraryDocument(documentId: string, body: DocumentUpdate): Promise<DocumentDetail>;
}
