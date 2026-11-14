/**
 * MOCK mode — in-memory implementation of WWHealthApi. No backend needed.
 * Uploads are added to the in-memory record, so new items show up in lists
 * until the app reloads. All AI output is marked isDemo: true.
 */
import { MEDICAL_DISCLAIMER, MOCK_DELAY_MS } from '@/config/config';
import { MOCK_PATIENT } from './mockPatient';
import type {
  AccessEvent,
  DoctorGrant,
  DoctorScope,
  EmergencyAccessEvent,
  LabValueEntry,
  MedicalDocument,
  MedicalSummary,
  PatientLabValue,
  PatientRecord,
  VerifiedDoctor,
  WWHealthApi,
  XrayAnalysis,
} from '@/types';
import { createId, delay } from '@/utils/async';

import { ApiError } from '@/services/api/ApiError';
import { mockSmartCare } from './mockSmartCare';

/** Deep copy (JSON-safe data only). */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Mutable copy so uploads during a session are visible in lists.
const db: PatientRecord = clone(MOCK_PATIENT);
// Doctor access (MOCK): same rules as the backend — verified doctor, sections, 1 h / 24 h / 7 d, revocable, audited.
// In MOCK mode the app is both the demo patient and the demo doctor, so the whole flow can be tried on one phone.
const MOCK_DOCTOR: VerifiedDoctor = { id: 'doc_demo_001', fullName: 'Dr. Demo Medic', doctorCode: 'DR-DEMO01' };
const doctorGrants: DoctorGrant[] = [];
let aiConsentAt: string | null = null;
const accessEvents: AccessEvent[] = [];
const grantStatus = (g: DoctorGrant): DoctorGrant['status'] =>
  g.revokedAt ? 'revoked' : new Date(g.expiresAt).getTime() <= Date.now() ? 'expired' : 'active';
const withStatus = (g: DoctorGrant): DoctorGrant => ({ ...g, status: grantStatus(g) });
const logAccess = (event: AccessEvent['event'], section: string | null = null, reason: string | null = null) =>
  accessEvents.unshift({ id: createId('acc'), event, section, reason, doctorName: MOCK_DOCTOR.fullName, createdAt: new Date().toISOString() });

const labKeyOf = (s: string | null) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Same rules as backend medical_summary.py: shared sections only, latest value per analysis + unit. */
function mockSummary(record: PatientRecord | null, documents: MedicalDocument[] | null, labs: PatientLabValue[] | null): MedicalSummary {
  const groups = new Map<string, PatientLabValue[]>();
  for (const v of labs ?? []) {
    const key = `${labKeyOf(v.name)}|${labKeyOf(v.unit)}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const date = (v: PatientLabValue) => v.measuredAt ?? v.documentDate ?? '';
  return {
    basics: record
      ? { dateOfBirth: record.dateOfBirth, sex: record.sex, bloodType: record.bloodType, heightCm: record.heightCm, weightKg: record.weightKg }
      : null,
    allergies: record ? record.allergies : null,
    conditions: record ? record.diagnoses.filter((d) => d.status === 'active') : null,
    medications: record ? record.treatments.filter((t) => t.active) : null,
    latestLabs: labs
      ? [...groups.values()]
          .map((rows) => {
            const last = [...rows].sort((a, b) => (date(a) < date(b) ? -1 : 1))[rows.length - 1];
            return { name: last.name, value: last.value, unit: last.unit, referenceRange: last.referenceRange, date: date(last) || null,
              documentTitle: last.documentTitle, measurements: rows.length };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      : null,
    documents: documents ? [...documents].sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)).slice(0, 5) : null,
  };
}

// Emergency passport (MOCK): same rules as the backend — 5 min, single use, revocable, audited.
const emergencyTokens = new Map<string, { id: string; expiresAt: number; usedAt?: number; revokedAt?: number }>();
const emergencyLog: EmergencyAccessEvent[] = [];
const logEmergency = (event: EmergencyAccessEvent['event'], reason: EmergencyAccessEvent['reason'] = null, actorName: string | null = null) =>
  emergencyLog.unshift({ id: createId('log'), event, reason, actorName, createdAt: new Date().toISOString() });

const labValues = new Map<string, LabValueEntry[]>();

const XRAY_LABELS = ['Normal', 'Pneumonia', 'Effusion', 'Cardiomegaly', 'Nodule'];

function fakePredictions() {
  const raw = XRAY_LABELS.map(() => Math.random());
  const total = raw.reduce((a, b) => a + b, 0);
  return XRAY_LABELS.map((label, i) => ({ label, probability: raw[i] / total })).sort(
    (a, b) => b.probability - a.probability,
  );
}

/** Applies scopes like the backend should: data outside the scopes is emptied. */
export const mockApi: WWHealthApi = {
  async health() {
    await delay(200);
    return { status: 'ok', version: 'mock' };
  },

  async getMyPatient() {
    await delay(MOCK_DELAY_MS);
    return clone(db);
  },

  async updateMyProfile(update) {
    await delay(MOCK_DELAY_MS);
    const today = new Date().toISOString().slice(0, 10);
    if (update.bloodType !== undefined) db.bloodType = update.bloodType;
    if (update.allergies) db.allergies = update.allergies.map((a) => ({ ...a, id: a.id ?? createId('al') }));
    if (update.diagnoses) {
      db.diagnoses = update.diagnoses.map((d) => ({
        id: d.id ?? createId('dg'),
        name: d.name,
        icd10: d.icd10 ?? null,
        diagnosedAt: d.diagnosedAt ?? today,
        status: d.status,
      }));
    }
    if (update.treatments) {
      db.treatments = update.treatments.map((t) => ({
        id: t.id ?? createId('tr'),
        name: t.name,
        dosage: t.dosage,
        frequency: t.frequency,
        startDate: t.startDate ?? today,
        endDate: t.endDate ?? null,
        active: t.active,
      }));
    }
    if (update.surgeries) {
      db.surgeries = update.surgeries.map((s) => ({ id: s.id ?? createId('sg'), name: s.name, date: s.date ?? null, notes: s.notes ?? '' }));
    }
    return clone(db);
  },

  // MOCK: the file stays on the device (fileUrl = local URI); nothing is uploaded.
  async uploadDocument(file, documentType, title) {
    await delay(MOCK_DELAY_MS);
    const uploadedAt = new Date().toISOString();
    const document: MedicalDocument = {
      id: createId('doc'),
      title: title || file.name,
      type: documentType,
      uploadedAt,
      fileUrl: file.uri,
      mimeType: file.type,
      sizeBytes: null,
      status: 'uploaded',
      extraction: null,
      isDemo: true,
    };
    db.documents.unshift(document);
    db.history.unshift({
      id: createId('ev'),
      type: 'document',
      title: document.title,
      description: 'Document uploaded (MOCK — stored only on this device).',
      date: uploadedAt,
      details: { Format: file.type === 'application/pdf' ? 'PDF' : 'Image' },
      documentId: document.id,
    });
    return { document: clone(document) };
  },

  async analyzeDocument(file, documentType, title) {
    await delay(MOCK_DELAY_MS * 2);
    const document = {
      id: createId('doc'),
      title: title || file.name,
      type: documentType,
      uploadedAt: new Date().toISOString(),
      fileUrl: file.uri,
      status: 'analyzed' as const,
      isDemo: true,
      extraction: {
        summary: 'Simulated Gemini extraction. Replace with the real backend response.',
        diagnoses: ['Mild persistent asthma'],
        allergies: ['Penicillin'],
        medications: ['Budesonide inhaler 200 mcg'],
        labValues: [{ name: 'CRP', value: '3.1', unit: 'mg/L', flag: 'normal' as const }],
      },
    };
    db.documents.unshift(document);
    return { document };
  },

  async analyzeXray(file) {
    const started = Date.now();
    await delay(MOCK_DELAY_MS * 2);
    const predictions = fakePredictions();
    const result: XrayAnalysis = {
      id: createId('xray'),
      createdAt: new Date().toISOString(),
      imageUrl: file.uri,
      heatmapUrl: null,
      predictions,
      topLabel: predictions[0].label,
      modelVersion: 'densenet121-demo',
      processingTimeMs: Date.now() - started,
      isDemo: true,
      disclaimer: MEDICAL_DISCLAIMER,
    };
    db.xrays.unshift(result);
    return result;
  },

  // No simulated LungVision scores: the real model only runs on the backend.
  async analyzeLung() {
    await delay(MOCK_DELAY_MS);
    throw new Error(
      'LungVision needs the backend model. Set EXPO_PUBLIC_USE_MOCKS=false in .env, start the backend and restart Expo.',
    );
  },

  // No text extraction in MOCK mode (it runs on the backend) — never invent values.
  async extractLabValues() {
    await delay(MOCK_DELAY_MS);
    throw new ApiError('Document scanning needs the backend (set EXPO_PUBLIC_USE_MOCKS=false).', 503);
  },
  async getLabValues(documentId) {
    return labValues.get(documentId) ?? [];
  },
  async saveLabValues(documentId, values) {
    await delay(MOCK_DELAY_MS);
    const stored = values.map(({ needsReview: _review, ...v }) => v);
    if (stored.length) labValues.set(documentId, stored);
    else labValues.delete(documentId);
    return stored;
  },
  async extractLabValuesFromDocument() {
    await delay(MOCK_DELAY_MS);
    throw new ApiError('Document scanning needs the backend (set EXPO_PUBLIC_USE_MOCKS=false).', 503);
  },
  async listLabValues() {
    return [...labValues.entries()].flatMap(([documentId, values]) => {
      const doc = db.documents.find((d) => d.id === documentId);
      return values.map((v) => ({ ...v, documentId, documentTitle: doc?.title ?? null, documentDate: doc?.uploadedAt.slice(0, 10) ?? null }));
    });
  },

  async createEmergencyToken() {
    await delay(MOCK_DELAY_MS);
    const now = Date.now();
    emergencyTokens.forEach((t) => {
      if (!t.usedAt && !t.revokedAt && t.expiresAt > now) t.revokedAt = now;
    });
    const token = `demo-${createId('em')}-${Math.random().toString(36).slice(2, 12)}`;
    const entry = { id: createId('tok'), expiresAt: now + 5 * 60_000 };
    emergencyTokens.set(token, entry);
    logEmergency('created');
    return { tokenId: entry.id, token, qrPayload: `wwhealth://emergency/${token}`, expiresAt: new Date(entry.expiresAt).toISOString(), ttlSeconds: 300 };
  },

  async revokeEmergencyToken(tokenId) {
    await delay(MOCK_DELAY_MS);
    const entry = [...emergencyTokens.values()].find((t) => t.id === tokenId && !t.usedAt && !t.revokedAt);
    if (!entry) throw new ApiError('No active emergency code to revoke', 404);
    entry.revokedAt = Date.now();
    logEmergency('revoked');
  },

  async redeemEmergencyToken({ token }) {
    await delay(MOCK_DELAY_MS);
    const entry = emergencyTokens.get(token.trim().replace(/^wwhealth:\/\/emergency\//i, ''));
    const deny = (reason: 'not_found' | 'expired' | 'used' | 'revoked', status: number, message: string) => {
      logEmergency('denied', reason, 'Demo Doctor');
      return new ApiError(message, status);
    };
    if (!entry) throw deny('not_found', 404, 'Invalid emergency code');
    if (entry.revokedAt) throw deny('revoked', 410, 'Emergency code revoked');
    if (entry.usedAt) throw deny('used', 409, 'Emergency code already used');
    if (entry.expiresAt <= Date.now()) throw deny('expired', 410, 'Emergency code expired');
    entry.usedAt = Date.now();
    logEmergency('viewed', null, 'Demo Doctor');
    return {
      bloodType: db.bloodType,
      allergies: db.allergies.map(({ substance, reaction, severity }) => ({ substance, reaction, severity })),
      conditions: db.diagnoses.filter((d) => d.status === 'active').map(({ name, icd10 }) => ({ name, icd10: icd10 ?? null })),
      medications: db.treatments.filter((m) => m.active).map(({ name, dosage, frequency }) => ({ name, dosage, frequency })),
      accessedAt: new Date(entry.usedAt).toISOString(),
    };
  },

  async getEmergencyAudit() {
    await delay(MOCK_DELAY_MS);
    return emergencyLog.slice(0, 20);
  },

  async getMyEmergencyAccesses() {
    await delay(MOCK_DELAY_MS);
    return emergencyLog.filter((e) => e.event === 'viewed' || e.event === 'denied');
  },

  async analyzeIntake() {
    await delay(MOCK_DELAY_MS);
    return {
      transcript: 'I have had a headache and a fever for three days.',
      language: 'en',
      summary: 'Headache and fever for three days.',
      symptoms: [
        { name: 'Headache', duration: '3 days', severity: null, notes: null },
        { name: 'Fever', duration: '3 days', severity: null, notes: null },
      ],
      medicationsMentioned: [],
      allergiesMentioned: [],
      urgentWarning: false,
      isDemo: true,
      disclaimer: 'AI organizes the reported symptoms. It does not diagnose.',
    };
  },

  async voiceSummary({ patientId }) {
    await delay(MOCK_DELAY_MS);
    if (patientId !== db.id) throw new ApiError('Patient not found', 404);
    const active = db.diagnoses.filter((d) => d.status === 'active').map((d) => d.name);
    return {
      text: `${db.fullName}, born ${db.dateOfBirth}. Active conditions: ${active.join(', ') || 'none'}. Allergies: ${db.allergies.map((a) => a.substance).join(', ') || 'none'}. Latest chest X-ray: ${db.xrays[0]?.topLabel ?? 'none'} (demo).`,
      audioUrl: null,
      isDemo: true,
    };
  },

  // AI Medical Intelligence: MOCK mode has no Gemini → a clear "not configured" state, never a simulated summary.
  async getAiConsent() {
    await delay(200);
    return { granted: aiConsentAt !== null, grantedAt: aiConsentAt };
  },

  async setAiConsent(granted) {
    await delay(200);
    aiConsentAt = granted ? new Date().toISOString() : null;
    return { granted, grantedAt: aiConsentAt };
  },

  async getMyIntelligence() {
    await delay(MOCK_DELAY_MS);
    const consent = aiConsentAt !== null;
    return { status: consent ? 'not_configured' : 'no_consent', aiConfigured: false, consent, summary: null, patientName: null, scopes: [] };
  },

  async generateMyIntelligence() {
    await delay(MOCK_DELAY_MS);
    throw new ApiError('AI is not configured on the server', 503);
  },

  async deleteMyIntelligence() {
    await delay(200);
  },

  async getPatientIntelligence(patientId) {
    await delay(MOCK_DELAY_MS);
    const view = await mockApi.openDoctorPatient(patientId);
    if (view.status !== 'ok') return { status: view.status === 'none' ? 'none' : view.status, aiConfigured: false, consent: false, summary: null, patientName: null, scopes: [] };
    return { status: aiConsentAt ? 'not_configured' : 'no_consent', aiConfigured: false, consent: aiConsentAt !== null, summary: null,
      patientName: view.patientName, scopes: view.scopes };
  },

  async generatePatientIntelligence() {
    await delay(MOCK_DELAY_MS);
    throw new ApiError('AI is not configured on the server', 503);
  },

  async getMySummary() {
    await delay(MOCK_DELAY_MS);
    return mockSummary(db, db.documents, await mockApi.listLabValues());
  },

  async searchDoctors(query) {
    await delay(MOCK_DELAY_MS);
    const q = query.trim();
    const match = !q || MOCK_DOCTOR.fullName.toLowerCase().includes(q.toLowerCase()) || MOCK_DOCTOR.doctorCode === q.toUpperCase();
    return match ? [MOCK_DOCTOR] : [];
  },

  async getDoctorAccess() {
    await delay(MOCK_DELAY_MS);
    return { grants: doctorGrants.map(withStatus), events: [...accessEvents] };
  },

  async grantDoctorAccess({ doctorId, doctorCode, scopes, durationHours }) {
    await delay(MOCK_DELAY_MS);
    if ((doctorId ?? '') !== MOCK_DOCTOR.id && (doctorCode ?? '').trim().toUpperCase() !== MOCK_DOCTOR.doctorCode) {
      throw new ApiError('Verified doctor not found', 404);
    }
    for (const g of doctorGrants) {
      if (grantStatus(g) === 'active') {
        g.revokedAt = new Date().toISOString();
        logAccess('revoked', null, 'replaced');
      }
    }
    const now = Date.now();
    const grant: DoctorGrant = {
      id: createId('grant'), doctorId: MOCK_DOCTOR.id, doctorName: MOCK_DOCTOR.fullName, doctorCode: MOCK_DOCTOR.doctorCode,
      scopes: [...new Set(scopes)].sort() as DoctorScope[], createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + durationHours * 3600_000).toISOString(), revokedAt: null, status: 'active',
    };
    doctorGrants.unshift(grant);
    logAccess('granted');
    return grant;
  },

  async revokeDoctorAccess(grantId) {
    await delay(MOCK_DELAY_MS);
    const g = doctorGrants.find((x) => x.id === grantId && grantStatus(x) === 'active');
    if (!g) throw new ApiError('Active access not found', 404);
    g.revokedAt = new Date().toISOString();
    logAccess('revoked');
  },

  async getDoctorIdentity() {
    await delay(200);
    return { fullName: MOCK_DOCTOR.fullName, doctorCode: MOCK_DOCTOR.doctorCode };
  },

  async listDoctorPatients(query = '') {
    await delay(MOCK_DELAY_MS);
    const latest = doctorGrants[0];
    if (!latest || !db.fullName.toLowerCase().includes(query.trim().toLowerCase())) return [];
    const g = withStatus(latest);
    return [{ patientId: db.id, fullName: db.fullName, grantId: g.id, scopes: g.scopes, createdAt: g.createdAt,
      expiresAt: g.expiresAt, revokedAt: g.revokedAt, status: g.status }];
  },

  async openDoctorPatient(patientId) {
    await delay(MOCK_DELAY_MS);
    const latest = doctorGrants[0];
    const base = { patientId, patientName: null, scopes: [], expiresAt: null, summary: null, documents: null, labs: null };
    if (!latest || patientId !== db.id) return { ...base, status: 'none' };
    const g = withStatus(latest);
    const known = { ...base, patientName: db.fullName, scopes: g.scopes, expiresAt: g.expiresAt };
    if (g.status !== 'active') {
      logAccess('denied', 'summary', g.status);
      return { ...known, status: g.status };
    }
    logAccess('viewed', 'summary');
    const has = (s: DoctorScope) => g.scopes.includes(s);
    const documents = has('documents') ? clone(db.documents) : null;
    const labs = has('labs') ? await mockApi.listLabValues() : null;
    return { ...known, status: 'ok', summary: mockSummary(has('profile') ? clone(db) : null, documents, labs), documents, labs };
  },

  ...mockSmartCare,
};
