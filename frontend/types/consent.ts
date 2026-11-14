/** Doctor Access & Consent — mirrors backend/app/schemas/doctor_access.py. */
import type { PatientLabValue } from './labs';
import type { Allergy, Diagnosis, MedicalDocument, Treatment } from './medical';

export type DoctorScope = 'profile' | 'documents' | 'labs';
export type GrantStatus = 'active' | 'expired' | 'revoked';
/** ok = data · none = no consent · expired / revoked = consent ended · forbidden = not a doctor account. */
export type OpenStatus = 'ok' | 'none' | 'expired' | 'revoked' | 'forbidden';
export type GrantDurationHours = 1 | 24 | 168;

export interface VerifiedDoctor {
  id: string;
  fullName: string;
  doctorCode: string;
}

export interface GrantRequest {
  /** Exactly one of doctorId (picked from the list) or doctorCode (typed). */
  doctorId?: string;
  doctorCode?: string;
  scopes: DoctorScope[];
  durationHours: GrantDurationHours;
}

export interface DoctorGrant {
  id: string;
  doctorId: string;
  doctorName: string | null;
  doctorCode: string | null;
  scopes: DoctorScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: GrantStatus;
}

export interface AccessEvent {
  id: string;
  event: 'granted' | 'revoked' | 'viewed' | 'denied';
  section: string | null;
  reason: string | null;
  doctorName: string | null;
  createdAt: string;
}

export interface AccessOverview {
  grants: DoctorGrant[];
  events: AccessEvent[];
}

export interface DoctorPatient {
  patientId: string;
  fullName: string;
  grantId: string;
  scopes: DoctorScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: GrantStatus;
}

export interface DoctorIdentity {
  fullName: string;
  doctorCode: string | null;
}

export interface LatestLab {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  date: string | null;
  documentTitle: string | null;
  measurements: number;
}

/** Sections that were not shared are null (shown as "not shared"), never empty-by-default. */
export interface MedicalSummary {
  basics: {
    dateOfBirth: string | null;
    sex: string | null;
    bloodType: string | null;
    heightCm: number | null;
    weightKg: number | null;
  } | null;
  allergies: Allergy[] | null;
  conditions: Diagnosis[] | null;
  medications: Treatment[] | null;
  latestLabs: LatestLab[] | null;
  documents: MedicalDocument[] | null;
  /** Confirmed from imported documents (diagnoses with certainty, allergies, procedures). */
  documentedFindings?: { kind: string; label: string; status: string | null; date: string | null; documentId: string; documentTitle: string | null }[] | null;
}

export interface PatientAccessView {
  status: OpenStatus;
  patientId: string;
  patientName: string | null;
  scopes: DoctorScope[];
  expiresAt: string | null;
  summary: MedicalSummary | null;
  documents: MedicalDocument[] | null;
  labs: PatientLabValue[] | null;
}
