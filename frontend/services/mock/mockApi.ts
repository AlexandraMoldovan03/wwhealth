/**
 * MOCK mode — in-memory implementation of WWHealthApi. No backend needed.
 * Uploads are added to the in-memory record, so new items show up in lists
 * until the app reloads. All AI output is marked isDemo: true.
 */
import { MEDICAL_DISCLAIMER, MOCK_DELAY_MS } from '@/config/config';
import { DEMO_ACCESS_TOKEN, MOCK_PATIENT } from './mockPatient';
import type { AccessScope, EmergencyAccessEvent, LabValueEntry, MedicalDocument, PatientRecord, WWHealthApi, XrayAnalysis } from '@/types';
import { createId, delay } from '@/utils/async';

import { ApiError } from '@/services/api/ApiError';

/** Deep copy (JSON-safe data only). */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Mutable copy so uploads during a session are visible in lists.
const db: PatientRecord = clone(MOCK_PATIENT);
const grants = new Map<string, { expiresAt: string; scopes: AccessScope[] }>([
  [DEMO_ACCESS_TOKEN, { expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), scopes: ['profile', 'history', 'documents', 'xrays'] }],
]);

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
function filterByScopes(record: PatientRecord, scopes: AccessScope[]): PatientRecord {
  const has = (s: AccessScope) => scopes.includes(s);
  return {
    ...record,
    allergies: has('profile') ? record.allergies : [],
    diagnoses: has('profile') ? record.diagnoses : [],
    treatments: has('profile') ? record.treatments : [],
    history: has('history') ? record.history : [],
    documents: has('documents') ? record.documents : [],
    xrays: has('xrays') ? record.xrays : [],
  };
}

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

  async grantAccess({ scopes, ttlMinutes }) {
    await delay(MOCK_DELAY_MS);
    const token = DEMO_ACCESS_TOKEN; // fixed in MOCK mode so the doctor flow is easy to demo
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    grants.set(token, { expiresAt, scopes });
    return { token, qrPayload: `wwhealth://access/${token}`, expiresAt, scopes };
  },

  async redeemAccess({ token }) {
    await delay(MOCK_DELAY_MS);
    const normalized = token.trim().toUpperCase().replace('WWHEALTH://ACCESS/', '');
    const grant = grants.get(normalized);
    if (!grant) throw new ApiError('Invalid or unknown access token', 404);
    if (new Date(grant.expiresAt).getTime() < Date.now()) throw new ApiError('Access token expired', 410);
    return {
      accessId: createId('acc'),
      expiresAt: grant.expiresAt,
      scopes: grant.scopes,
      patient: filterByScopes(clone(db), grant.scopes),
    };
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
};
