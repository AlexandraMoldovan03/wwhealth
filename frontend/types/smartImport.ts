/** Universal Smart Import (preview → confirm) and Document Library — mirrors backend/app/schemas/smart_import.py. */
import type { DocumentType, MedicalDocument } from './medical';

export type SourceFormat = 'pdf_text' | 'pdf_scanned' | 'image' | 'fhir_json' | 'fhir_ndjson' | 'csv';
export type FactKind = 'diagnosis' | 'symptom' | 'medication' | 'allergy' | 'procedure' | 'investigation' | 'recommendation'
  | 'follow_up' | 'vaccination' | 'reason';
export type ImportStatus = 'preview' | 'confirmed' | 'rejected' | 'failed';
export type ImportMethod = 'local' | 'gemini' | 'local_fallback';

export interface SourceRef {
  page: number | null;
  excerpt: string | null;
  /** The excerpt was found in the document text (false → "to verify"). */
  verified: boolean;
}

export interface ExtractedItem {
  key: string;
  kind: FactKind;
  label: string;
  detail: string | null;
  /** Diagnosis certainty (confirmed / suspected / ruled_out / history) or medication context (at_discharge, …). */
  status: string | null;
  date: string | null;
  value: Record<string, unknown>;
  source: SourceRef;
  uncertain: boolean;
  include: boolean;
  edited: boolean;
}

export interface ExtractedLab {
  key: string;
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  measuredAt: string | null;
  source: SourceRef;
  uncertain: boolean;
  include: boolean;
  edited: boolean;
}

export interface NerTerm {
  text: string;
  kind: 'Disease' | 'Chemical';
  start: number;
  end: number;
  page: number | null;
  confidence: number | null;
  context: string;
}

export interface ImportExtraction {
  nerTerms?: NerTerm[];
  category: DocumentType;
  specialty: string | null;
  proposedTitle: string;
  eventDate: string | null;
  documentDate: string | null;
  institution: string | null;
  physician: string | null;
  items: ExtractedItem[];
  labs: ExtractedLab[];
  toVerify: string[];
  pageCount: number;
  truncated: boolean;
  textFound: boolean;
}

export interface IdentityCheck {
  status: 'match' | 'unverified' | 'mismatch' | 'insufficient' | 'demo';
  reasons: string[];
  documentName: string | null;
  documentBirthDate: string | null;
  requiresConfirmation: boolean;
}

export interface DuplicateHint {
  documentId: string;
  title: string;
  reason: 'same_file' | 'same_event';
  date: string | null;
}

export interface Contradiction {
  code: string;
  label: string;
  existing: string | null;
  incoming: string | null;
}

export interface ImportPreview {
  id: string;
  documentId: string | null;
  status: ImportStatus;
  sourceFormat: SourceFormat;
  method: ImportMethod;
  model: string | null;
  originalFilename: string | null;
  createdAt: string;
  extraction: ImportExtraction;
  identity: IdentityCheck;
  duplicates: DuplicateHint[];
  contradictions: Contradiction[];
  isDemo: boolean;
  cached: boolean;
  fallbackReason: string | null;
  history: { at: string; action: string }[];
}

export interface ImportConfirm {
  title: string;
  category: DocumentType;
  specialty: string | null;
  eventDate: string | null;
  institution: string | null;
  items: ExtractedItem[];
  labs: ExtractedLab[];
  identityConfirmed: boolean;
}

/** CSV column mapping (header names in the file). */
export interface CsvMapping {
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  date?: string;
}

export interface DocumentFact {
  id: string;
  documentId: string;
  kind: FactKind;
  label: string;
  detail: string | null;
  status: string | null;
  eventDate: string | null;
  sourcePage: number | null;
  sourceExcerpt: string | null;
  value: Record<string, unknown>;
  edited: boolean;
  documentTitle: string | null;
}

export interface DocumentDetail {
  nerTerms?: NerTerm[];
  document: MedicalDocument;
  facts: DocumentFact[];
  importId: string | null;
}

export interface DocumentUpdate {
  title?: string;
  category?: DocumentType;
  specialty?: string | null;
  eventDate?: string | null;
  institution?: string | null;
}

export type LibrarySort = 'date' | 'title' | 'uploaded';

export interface LibraryQuery {
  q?: string;
  category?: DocumentType | null;
  specialty?: string | null;
  institution?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: LibrarySort;
  order?: 'asc' | 'desc';
}

export interface LibraryPage {
  documents: MedicalDocument[];
  institutions: string[];
  specialties: string[];
}

export interface AiUsageSummary {
  todayCalls: number;
  todayTokens: number;
  todayCostUsd: number;
  monthCalls: number;
  monthTokens: number;
  monthCostUsd: number;
  dailyBudgetUsd: number;
  model: string;
  recent: { feature: string; model: string; promptTokens: number; outputTokens: number; estCostUsd: number; status: string; createdAt: string }[];
}
