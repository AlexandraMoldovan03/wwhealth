/**
 * MOCK mode — Smart Import + Document Library, same rules as the backend (preview first, nothing integrated before
 * confirmation, imported medication is historical, idempotent re-imports by file). The "analysis" is a fixed DEMO
 * extraction (no OCR / AI in the app); every imported document is marked isDemo.
 */
import { ApiError } from '@/services/api/ApiError';
import type {
  DocumentFact,
  ExtractedItem,
  ImportPreview,
  MedicalDocument,
  PatientRecord,
  WWHealthApi,
} from '@/types';
import { createId, delay } from '@/utils/async';

/** Confirmed facts (read by the mock intelligent record). */
export const mockDocumentFacts: DocumentFact[] = [];
const imports = new Map<string, ImportPreview>();
const byFile = new Map<string, string>();
const usage: { at: string; tokens: number }[] = [];

const src = (page: number, excerpt: string) => ({ page, excerpt, verified: true });
const item = (kind: ExtractedItem['kind'], label: string, status: string | null, excerpt: string, extra: Partial<ExtractedItem> = {}): ExtractedItem => ({
  key: createId('k').padEnd(10, '0'), kind, label, detail: null, status, date: '2023-06-12', value: {}, source: src(1, excerpt),
  uncertain: status === 'suspected', include: true, edited: false, ...extra,
});

function demoPreview(fileName: string, documentId: string): ImportPreview {
  const csv = /\.csv$/i.test(fileName);
  return {
    id: createId('imp'), documentId, status: 'preview', sourceFormat: csv ? 'csv' : 'pdf_text', method: csv ? 'local' : 'local_fallback',
    model: null, originalFilename: fileName, createdAt: new Date().toISOString(), isDemo: true, cached: false,
    fallbackReason: csv ? null : 'not_configured', history: [{ at: new Date().toISOString(), action: 'analyzed' }],
    extraction: csv
      ? { category: 'lab_result', specialty: null, proposedTitle: 'Analize de laborator – martie 2024', eventDate: '2024-03-12', documentDate: '2024-03-12',
          institution: null, physician: null, items: [], toVerify: [], pageCount: 1, truncated: false, textFound: true,
          labs: [{ key: 'lab-demo-hb-0', name: 'Hemoglobina', value: '13,5', unit: 'g/dL', referenceRange: '12-16', measuredAt: '2024-03-12',
            source: { page: null, excerpt: 'CSV line 2', verified: true }, uncertain: false, include: true, edited: false }] }
      : { category: 'discharge_summary', specialty: 'cardiology', proposedTitle: 'Externare pentru hipertensiune arterială', eventDate: '2023-06-12',
          documentDate: '2023-06-12', institution: 'Spital de exemplu', physician: 'Dr. Alex Test', pageCount: 2, truncated: false, textFound: true,
          toVerify: ['placeholder_values'], labs: [],
          items: [
            item('diagnosis', 'Hipertensiune arterială', 'confirmed', 'Diagnosis: Arterial Hypertension'),
            item('diagnosis', 'Diabet zaharat tip 2', 'history', 'past medical history significant for Type 2 Diabetes Mellitus', { date: null }),
            item('medication', 'Lisinopril', 'at_discharge', 'Lisinopril 10 mg: Take 1 tablet by mouth once daily', { detail: '10 mg · o dată pe zi' }),
            item('follow_up', 'Control la clinica de hipertensiune', null, 'follow-up appointment … on June 26, 2023', { date: '2023-06-26' }),
          ] },
    identity: { status: 'demo', reasons: ['synthetic_document'], documentName: null, documentBirthDate: null, requiresConfirmation: true },
    duplicates: [], contradictions: csv ? [] : [{ code: 'medication_not_in_active_list', label: 'Lisinopril', existing: null, incoming: '10 mg' }],
  };
}

export function createMockSmartImport(deps: { record: () => PatientRecord }): Pick<WWHealthApi,
  'createImport' | 'getImport' | 'confirmImport' | 'rejectImport' | 'reanalyzeImport' | 'getAiUsage' | 'getLibrary'
  | 'getLibraryDocument' | 'updateLibraryDocument'> {
  const find = (id: string) => {
    const p = imports.get(id);
    if (!p) throw new ApiError('not_found', 404, { detail: 'not_found' });
    return p;
  };
  const doc = (id: string) => {
    const d = deps.record().documents.find((x) => x.id === id);
    if (!d) throw new ApiError('not_found', 404, { detail: 'not_found' });
    return d;
  };
  return {
    async createImport(file) {
      await delay(600);
      const key = `${file.name}|${file.uri}`;
      const existing = byFile.get(key);
      if (existing && imports.get(existing)?.status !== 'rejected') return { ...find(existing), cached: true };
      const documentId = createId('doc');
      const preview = demoPreview(file.name, documentId);
      const d: MedicalDocument = { id: documentId, title: preview.extraction.proposedTitle, type: preview.extraction.category,
        uploadedAt: new Date().toISOString(), fileUrl: file.uri, mimeType: file.type, sizeBytes: null, status: 'uploaded', extraction: null,
        isDemo: true, originalFilename: file.name, specialty: preview.extraction.specialty, eventDate: preview.extraction.eventDate,
        institution: preview.extraction.institution, processingStatus: 'needs_review', importId: preview.id };
      deps.record().documents.unshift(d);
      imports.set(preview.id, preview);
      byFile.set(key, preview.id);
      return preview;
    },
    async getImport(id) { await delay(150); return find(id); },
    async confirmImport(id, body) {
      await delay(300);
      const p = find(id);
      if (p.identity.status !== 'match' && !body.identityConfirmed) throw new ApiError('identity_confirmation_required', 409, { detail: 'identity_confirmation_required' });
      if (!p.documentId) throw new ApiError('not_found', 404, { detail: 'not_found' });
      const d = doc(p.documentId);
      Object.assign(d, { title: body.title, type: body.category, specialty: body.specialty, eventDate: body.eventDate, institution: body.institution,
        processingStatus: 'confirmed', status: 'analyzed' });
      for (let i = mockDocumentFacts.length - 1; i >= 0; i--) if (mockDocumentFacts[i].documentId === d.id) mockDocumentFacts.splice(i, 1);
      body.items.filter((x) => x.include).forEach((x) => mockDocumentFacts.push({
        id: createId('fact'), documentId: d.id, kind: x.kind, label: x.label, detail: x.detail,
        status: x.kind === 'medication' && x.status === 'active' ? 'unknown' : x.status, eventDate: x.date ?? body.eventDate,
        sourcePage: x.source.page, sourceExcerpt: x.source.excerpt, value: x.value, edited: x.edited, documentTitle: body.title }));
      const next: ImportPreview = { ...p, status: 'confirmed', history: [...p.history, { at: new Date().toISOString(), action: 'confirmed' }] };
      imports.set(id, next);
      return next;
    },
    async rejectImport(id) {
      await delay(200);
      const p = find(id);
      const rec = deps.record();
      if (p.documentId) rec.documents = rec.documents.filter((d) => d.id !== p.documentId);
      const next: ImportPreview = { ...p, status: 'rejected', documentId: null, history: [...p.history, { at: new Date().toISOString(), action: 'rejected' }] };
      imports.set(id, next);
      return next;
    },
    async reanalyzeImport(id) { await delay(500); usage.push({ at: new Date().toISOString(), tokens: 0 }); return { ...find(id), status: 'preview' }; },
    async getAiUsage() {
      await delay(100);
      return { todayCalls: 0, todayTokens: 0, todayCostUsd: 0, monthCalls: 0, monthTokens: 0, monthCostUsd: 0, dailyBudgetUsd: 0.5,
        model: 'MOCK (fără Gemini)', recent: [] };
    },
    async getLibrary(query) {
      await delay(200);
      const all = deps.record().documents;
      const when = (d: MedicalDocument) => (d.eventDate ?? d.documentDate ?? d.uploadedAt).slice(0, 10);
      const fold = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      let rows = all.filter((d) => !query.q || fold(`${d.title} ${d.originalFilename ?? ''} ${d.institution ?? ''}`).includes(fold(query.q)));
      if (query.category) rows = rows.filter((d) => d.type === query.category);
      if (query.specialty) rows = rows.filter((d) => d.specialty === query.specialty);
      if (query.institution) rows = rows.filter((d) => d.institution === query.institution);
      if (query.from) rows = rows.filter((d) => when(d) >= query.from!);
      if (query.to) rows = rows.filter((d) => when(d) <= query.to!);
      const key = query.sort === 'title' ? (d: MedicalDocument) => fold(d.title) : query.sort === 'uploaded' ? (d: MedicalDocument) => d.uploadedAt : when;
      rows = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : 1));
      if (query.order !== 'asc') rows.reverse();
      return { documents: rows,
        institutions: [...new Set(all.map((d) => d.institution).filter((x): x is string => !!x))].sort(),
        specialties: [...new Set(all.map((d) => d.specialty).filter((x): x is string => !!x))].sort() };
    },
    async getLibraryDocument(id) {
      await delay(150);
      const d = doc(id);
      return { document: d, facts: mockDocumentFacts.filter((f) => f.documentId === id), importId: d.importId ?? null };
    },
    async updateLibraryDocument(id, body) {
      await delay(200);
      const d = doc(id);
      if (body.title !== undefined) d.title = body.title;
      if (body.category !== undefined) d.type = body.category;
      if (body.eventDate !== undefined) d.eventDate = body.eventDate;
      if (body.institution !== undefined) d.institution = body.institution;
      if (body.specialty !== undefined) d.specialty = body.specialty;
      return { document: d, facts: mockDocumentFacts.filter((f) => f.documentId === id), importId: d.importId ?? null };
    },
  };
}
