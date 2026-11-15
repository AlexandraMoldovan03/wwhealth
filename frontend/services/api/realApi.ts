/** API mode — real HTTP calls to FastAPI. One method per endpoint in docs/API_CONTRACT.md. */
import type { JsonValue, WWHealthApi } from '@/types';

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';


const AI_TIMEOUT_MS = 60_000;
/** Typed object → JsonValue (drops undefined fields). */
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
export const realApi: WWHealthApi = {
  health: () => apiClient.get(ENDPOINTS.health, { timeoutMs: 5_000 }),

  getMyPatient: () => apiClient.get(ENDPOINTS.patientsMe),

  // JSON.parse(JSON.stringify()) turns the typed object into JsonValue (drops undefined fields).
  updateMyProfile: (update) => apiClient.patch(ENDPOINTS.patientsMe, JSON.parse(JSON.stringify(update)) as JsonValue),

  uploadDocument: (file, documentType, title) =>
    apiClient.upload(ENDPOINTS.documents, { file }, { documentType, title }, { timeoutMs: 60_000 }),

  analyzeDocument: (file, documentType, title) =>
    apiClient.upload(ENDPOINTS.documentsAnalyze, { file }, { documentType, title }),

  analyzeXray: (file) => apiClient.upload(ENDPOINTS.xrayAnalyze, { file }),

  // Model + Grad-CAM run on CPU; the first call also loads the model.
  analyzeLung: (file) => apiClient.upload(ENDPOINTS.lungAnalyze, { file }, {}, { timeoutMs: 60_000 }),

  analyzeIntake: (file) => apiClient.upload(ENDPOINTS.voiceIntake, { file }, {}, { timeoutMs: 190_000 }),

  voiceSummary: (request) =>
    apiClient.post(ENDPOINTS.voiceSummary, { patientId: request.patientId, language: request.language }),

  extractLabValues: (file) => apiClient.upload(ENDPOINTS.documentsExtractLabs, { file }, {}, { timeoutMs: 90_000 }),
  getLabValues: (documentId) => apiClient.get(ENDPOINTS.documentLabValues(documentId)),
  extractLabValuesFromDocument: (documentId) => apiClient.post(ENDPOINTS.documentExtractLabs(documentId), undefined, { timeoutMs: 90_000 }),
  listLabValues: () => apiClient.get(ENDPOINTS.labValues),
  saveLabValues: (documentId, values) =>
    apiClient.put(ENDPOINTS.documentLabValues(documentId), { values: JSON.parse(JSON.stringify(values)) as JsonValue }),

  createEmergencyToken: () => apiClient.post(ENDPOINTS.emergencyTokens),
  revokeEmergencyToken: (tokenId) => apiClient.post(ENDPOINTS.emergencyRevoke(tokenId)),
  getEmergencyTokenStatus: (tokenId) => apiClient.get(ENDPOINTS.emergencyTokenStatus(tokenId)),
  // The scanned token goes to FastAPI as-is; validation never happens in the app.
  redeemEmergencyToken: (request) => apiClient.post(ENDPOINTS.emergencyRedeem, { token: request.token }),
  getEmergencyAudit: () => apiClient.get(ENDPOINTS.emergencyAudit),
  getMyEmergencyAccesses: () => apiClient.get(ENDPOINTS.emergencyMyAccesses),
  getEmergencyGuardians: () => apiClient.get(ENDPOINTS.emergencyGuardians),
  getEmergencyPassportPreview: () => apiClient.get(ENDPOINTS.emergencyPassport),
  getDocumentSummary: (documentId) => apiClient.get(ENDPOINTS.documentSummary(documentId)),
  inviteEmergencyGuardian: (request) =>
    apiClient.post(ENDPOINTS.emergencyGuardians, { email: request.email, relation: request.relation }),
  revokeEmergencyGuardian: (id) => apiClient.post(ENDPOINTS.emergencyGuardianAction(id, 'revoke')),
  respondEmergencyGuardian: (id, accept) =>
    apiClient.post(ENDPOINTS.emergencyGuardianAction(id, accept ? 'accept' : 'decline')),
  getGuardianEmergencyView: (patientId) => apiClient.get(ENDPOINTS.emergencyGuardianPatient(patientId)),
  createGuardianEmergencyToken: (patientId) => apiClient.post(ENDPOINTS.emergencyGuardianPatientToken(patientId)),

  getMySummary: () => apiClient.get(ENDPOINTS.patientsMeSummary),
  searchDoctors: (query) => apiClient.get(ENDPOINTS.doctorAccessDoctors, { params: { q: query } }),
  getDoctorAccess: () => apiClient.get(ENDPOINTS.doctorAccessGrants),
  grantDoctorAccess: (request) => apiClient.post(ENDPOINTS.doctorAccessGrants, JSON.parse(JSON.stringify(request)) as JsonValue),
  revokeDoctorAccess: (grantId) => apiClient.post(ENDPOINTS.doctorAccessRevoke(grantId)),
  getDoctorIdentity: () => apiClient.get(ENDPOINTS.doctorAccessMe),
  listDoctorPatients: (query = '') => apiClient.get(ENDPOINTS.doctorAccessPatients, { params: { q: query } }),
  openDoctorPatient: (patientId) => apiClient.get(ENDPOINTS.doctorAccessPatient(patientId)),

  getAiConsent: () => apiClient.get(ENDPOINTS.aiConsent),
  setAiConsent: (granted) => apiClient.put(ENDPOINTS.aiConsent, { granted }),
  getMyIntelligence: () => apiClient.get(ENDPOINTS.aiMe),
  // Gemini may take up to ~30 s on the server.
  generateMyIntelligence: (language) => apiClient.post(ENDPOINTS.aiMeGenerate, { language }, { timeoutMs: AI_TIMEOUT_MS }),
  deleteMyIntelligence: () => apiClient.delete(ENDPOINTS.aiMe),
  getPatientIntelligence: (patientId) => apiClient.get(ENDPOINTS.aiPatient(patientId)),
  generatePatientIntelligence: (patientId, language) =>
    apiClient.post(ENDPOINTS.aiPatientGenerate(patientId), { language }, { timeoutMs: AI_TIMEOUT_MS }),

  listSpecialties: (query, language) => apiClient.get(ENDPOINTS.careSpecialties, { params: { q: query, lang: language } }),
  transcribeSymptoms: (file) =>
    apiClient.upload(ENDPOINTS.careTranscribe, { file }, { elevenlabsConsent: 'true' }, { timeoutMs: 150_000 }),
  triageSymptoms: (request) =>
    apiClient.post(ENDPOINTS.careTriage, JSON.parse(JSON.stringify(request)) as JsonValue, { timeoutMs: AI_TIMEOUT_MS }),
  listSpecialtyDoctors: (specialtyId) => apiClient.get(ENDPOINTS.careSpecialtyDoctors(specialtyId)),
  listDoctorSlots: (doctorId) => apiClient.get(ENDPOINTS.careDoctorSlots(doctorId)),
  requestAppointment: (request, language) =>
    apiClient.post(ENDPOINTS.careAppointments, JSON.parse(JSON.stringify(request)) as JsonValue, { params: { lang: language } }),
  listMyAppointments: (language) => apiClient.get(ENDPOINTS.careAppointments, { params: { lang: language } }),
  updateMyAppointment: (appointmentId, action, language) =>
    apiClient.post(ENDPOINTS.careAppointmentAction(appointmentId), { action }, { params: { lang: language } }),
  listDoctorAppointments: (language) => apiClient.get(ENDPOINTS.careDoctorAppointments, { params: { lang: language } }),
  respondAppointment: (appointmentId, action, language) =>
    apiClient.post(ENDPOINTS.careDoctorRespond(appointmentId), JSON.parse(JSON.stringify(action)) as JsonValue, { params: { lang: language } }),
  listMyAvailability: () => apiClient.get(ENDPOINTS.careAvailability),
  listMyFreeSlots: () => apiClient.get(ENDPOINTS.careFreeSlots),
  addAvailability: (request) => apiClient.post(ENDPOINTS.careAvailability, JSON.parse(JSON.stringify(request)) as JsonValue),
  deleteAvailability: (slotId) => apiClient.delete(ENDPOINTS.careAvailabilitySlot(slotId)),

  getMySchedule: () => apiClient.get(ENDPOINTS.cjSchedule),
  saveMySchedule: (schedule) => apiClient.put(ENDPOINTS.cjSchedule, json(schedule)),
  listMyTimeOff: () => apiClient.get(ENDPOINTS.cjTimeOff),
  addTimeOff: (request) => apiClient.post(ENDPOINTS.cjTimeOff, json(request)),
  deleteTimeOff: (id) => apiClient.delete(ENDPOINTS.cjTimeOffItem(id)),
  getAgenda: (fromIso, toIso, language) => apiClient.get(ENDPOINTS.cjAgenda, { params: { from: fromIso, to: toIso, lang: language } }),
  getConsultation: (appointmentId, language) => apiClient.get(ENDPOINTS.cjConsultation(appointmentId), { params: { lang: language } }),
  listPatientTreatments: (patientId) => apiClient.get(ENDPOINTS.cjDoctorTreatments(patientId)),
  createTreatment: (request) => apiClient.post(ENDPOINTS.cjTreatmentCreate, json(request)),
  updateTreatment: (planId, request) => apiClient.put(ENDPOINTS.cjTreatmentItem(planId), json(request)),
  endTreatment: (planId, status, reason) => apiClient.post(ENDPOINTS.cjTreatmentEnd(planId), { status, reason }),
  getPatientRecordView: (patientId, view, appointmentId, language) =>
    apiClient.get(ENDPOINTS.cjDoctorRecord(patientId), { params: { view, lang: language, ...(appointmentId ? { appointmentId } : {}) } }),
  getPatientInsights: (patientId, language, reason) =>
    apiClient.post(ENDPOINTS.cjDoctorInsights(patientId), { language, reason }, { timeoutMs: AI_TIMEOUT_MS }),
  getPreparation: (appointmentId) => apiClient.get(ENDPOINTS.cjPreparation(appointmentId)),
  savePreparation: (appointmentId, body) => apiClient.put(ENDPOINTS.cjPreparation(appointmentId), json(body)),
  getMyTreatments: (timezone) => apiClient.get(ENDPOINTS.cjTreatments, { params: { tz: timezone } }),
  getMyTreatment: (planId) => apiClient.get(ENDPOINTS.cjMyTreatment(planId)),
  getReminderSchedule: (timezone) => apiClient.get(ENDPOINTS.cjReminders, { params: { tz: timezone } }),
  markDose: (planId, scheduledFor, status, timezone) =>
    apiClient.post(ENDPOINTS.cjDoses, { planId, scheduledFor, status }, { params: { tz: timezone } }),
  getMyRecordView: (view, appointmentId, language) =>
    apiClient.get(ENDPOINTS.cjRecord, { params: { view, lang: language, ...(appointmentId ? { appointmentId } : {}) } }),
  getMyInsights: (language, reason) => apiClient.post(ENDPOINTS.cjInsights, { language, reason }, { timeoutMs: AI_TIMEOUT_MS }),
  exportMyFhir: () => apiClient.get(ENDPOINTS.cjFhir),

  // OCR / Gemini run on the server; a long scanned document can take a while.
  createImport: (file, csvMapping) =>
    apiClient.upload(ENDPOINTS.imports, { file }, csvMapping ? { csvMapping: JSON.stringify(csvMapping) } : {}, { timeoutMs: 120_000 }),
  getImport: (importId) => apiClient.get(ENDPOINTS.importItem(importId)),
  confirmImport: (importId, body) => apiClient.post(ENDPOINTS.importConfirm(importId), json(body)),
  rejectImport: (importId) => apiClient.post(ENDPOINTS.importReject(importId)),
  reanalyzeImport: (importId) => apiClient.post(ENDPOINTS.importReanalyze(importId), undefined, { timeoutMs: 120_000 }),
  getAiUsage: () => apiClient.get(ENDPOINTS.importUsage),
  getLibrary: (query) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== '') params[k] = String(v);
    return apiClient.get(ENDPOINTS.library, { params });
  },
  getLibraryDocument: (documentId) => apiClient.get(ENDPOINTS.libraryItem(documentId)),
  updateLibraryDocument: (documentId, body) => apiClient.patch(ENDPOINTS.libraryItem(documentId), json(body)),
};
