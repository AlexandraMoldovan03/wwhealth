/** AI Medical Intelligence — mirrors backend/app/schemas/intelligence.py. */
import type { DoctorScope } from './consent';

export type IntelligenceSourceKind = 'profile' | 'allergy' | 'condition' | 'medication' | 'surgery' | 'lab' | 'document';
export type IntelligenceCategory = 'priority' | 'active' | 'history' | 'verify';
/** Explicit rules on stored data, never an AI score. */
export type IntelligenceFlag = 'anaphylaxis' | 'severe_allergy' | 'abnormal_lab';

export interface IntelligenceSource {
  id: string;
  kind: IntelligenceSourceKind;
  label: string;
  date: string | null;
  documentId: string | null;
  flag: IntelligenceFlag | null;
}

export interface IntelligenceItem {
  text: string;
  /** Rule-based "needs verification" items: translated in the app (ai.missing.<code>). */
  code: string | null;
  sourceIds: string[];
  /** record = built by rules from stored data · ai = Gemini text that passed the source checks. */
  origin: 'record' | 'ai';
  flag: IntelligenceFlag | null;
}

export interface IntelligenceSection {
  category: IntelligenceCategory;
  items: IntelligenceItem[];
}

export interface MedicalIntelligence {
  overview: string;
  overviewSourceIds: string[];
  sections: IntelligenceSection[];
  sources: IntelligenceSource[];
  sourceScopes: DoctorScope[];
  language: 'ro' | 'en';
  model: string;
  generatedAt: string;
  discardedStatements: number;
}

export type IntelligenceStatus = 'ok' | 'none' | 'no_consent' | 'not_configured' | 'forbidden' | 'expired' | 'revoked';

export interface IntelligenceView {
  status: IntelligenceStatus;
  aiConfigured: boolean;
  consent: boolean;
  summary: MedicalIntelligence | null;
  patientName: string | null;
  scopes: DoctorScope[];
}

export interface AiConsent {
  granted: boolean;
  grantedAt: string | null;
}
