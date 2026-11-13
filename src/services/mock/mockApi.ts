/**
 * MOCK mode — in-memory implementation of WWHealthApi. No backend needed.
 * Uploads are added to the in-memory record, so new items show up in lists
 * until the app reloads. All AI output is marked isDemo: true.
 */
import { MEDICAL_DISCLAIMER, MOCK_DELAY_MS } from '@/constants/config';
import { DEMO_ACCESS_TOKEN, MOCK_PATIENT } from '@/data/mockPatient';
import type { AccessScope, PatientRecord, WWHealthApi, XrayAnalysis } from '@/types';
import { createId, delay } from '@/utils/async';

import { ApiError } from '../api/ApiError';

/** Deep copy (JSON-safe data only). */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Mutable copy so uploads during a session are visible in lists.
const db: PatientRecord = clone(MOCK_PATIENT);
const grants = new Map<string, { expiresAt: string; scopes: AccessScope[] }>([
  [DEMO_ACCESS_TOKEN, { expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), scopes: ['profile', 'history', 'documents', 'xrays'] }],
]);

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
