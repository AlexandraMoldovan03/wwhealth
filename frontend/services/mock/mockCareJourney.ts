/**
 * MOCK mode — Care Journey with the same rules as the backend demo store (no network, fictive data):
 * schedule → free slots (booked slots / appointments are never removed), days off, agenda, consultation preparation,
 * prescriptions with immutable versions (only with a 'profile' grant, only the prescriber), doses for documented
 * times only, intelligent record views. No AI: insights answer "not configured" (or emergency rules).
 * In MOCK mode the app is both the demo patient and the demo doctor (doc_demo_001). Local device time is used.
 */
import { ApiError } from '@/services/api/ApiError';
import { mockDocumentFacts } from './mockSmartImport';
import type {
  Appointment,
  ConsultationSheet,
  DoctorSchedule,
  DoseEvent,
  OrganizedRecord,
  PatientRecord,
  Preparation,
  RecordCategory,
  RecordItem,
  TimeOff,
  PlanVersionInput,
  TreatmentPlan,
  TreatmentStatus,
  TreatmentVersion,
  WWHealthApi,
} from '@/types';
import { createId, delay } from '@/utils/async';

import { mockCareStore, mockTimeOff } from './mockSmartCare';

type Deps = { hasGrant: (scope: 'profile' | 'documents' | 'labs') => boolean; record: () => PatientRecord };

const DOCTOR_ID = 'doc_demo_001';
const DOCTOR_NAME = 'Dr. Alex Test';
const nowIso = () => new Date().toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const forbidden = (msg: string) => new ApiError(msg, 403);

let schedule: DoctorSchedule = { timezone: 'Europe/Bucharest', slotMinutes: 30, horizonDays: 30, hours: [], configured: false };
const timeOff: TimeOff[] = [];
const preparations = new Map<string, Preparation>();
type Row = { plan: Omit<TreatmentPlan, 'status' | 'current' | 'history' | 'canEdit'>; versions: TreatmentVersion[] };
const plans: Row[] = [];
const doseLog = new Map<string, DoseEvent>();

export function statusOf(stored: TreatmentPlan['storedStatus'], start: string, end: string | null, today = ymd(new Date())): TreatmentStatus {
  if (stored === 'cancelled') return 'CANCELLED';
  if (stored === 'discontinued') return 'DISCONTINUED';
  if (today < start) return 'UPCOMING';
  if (end && today > end) return 'COMPLETED';
  return 'ACTIVE';
}

function toPlan(row: Row, viewerIsDoctor: boolean): TreatmentPlan {
  const versions = [...row.versions].sort((a, b) => a.version - b.version);
  const current = versions[versions.length - 1];
  return {
    ...row.plan, current, history: [...versions].reverse(),
    status: statusOf(row.plan.storedStatus, current.startDate, current.endDate),
    canEdit: viewerIsDoctor && row.plan.prescriberId === DOCTOR_ID && row.plan.storedStatus === 'active',
  };
}

function version(body: PlanVersionInput, n: number, status: TreatmentVersion['status'], kind: TreatmentVersion['changeKind'], reason: string | null): TreatmentVersion {
  return {
    medicationName: body.medicationName.trim(), activeSubstance: body.activeSubstance ?? null, strength: body.strength ?? null,
    dosageForm: body.dosageForm ?? null, doseAmount: body.doseAmount ?? null, doseUnit: body.doseUnit ?? null, route: body.route ?? null,
    scheduleType: body.scheduleType, timesOfDay: [...new Set(body.timesOfDay)].sort(), frequencyText: body.frequencyText ?? null,
    startDate: body.startDate, endDate: body.endDate ?? null, instructions: body.instructions ?? null,
    version: n, status, changeKind: kind, changeReason: reason?.trim() || null, changedByName: DOCTOR_NAME, changedAt: nowIso(),
  };
}

function check(body: PlanVersionInput) {
  if ((body.scheduleType === 'fixed_times') !== body.timesOfDay.length > 0) throw new ApiError('Invalid times_of_day', 422);
  if (body.endDate && body.endDate < body.startDate) throw new ApiError('Invalid dates', 422);
}

function doseTimes(p: TreatmentPlan, from: Date, to: Date): Date[] {
  const v = p.current;
  if (v.scheduleType !== 'fixed_times' || p.storedStatus !== 'active') return [];
  const out: Date[] = [];
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (; day <= to; day.setDate(day.getDate() + 1)) {
    const key = ymd(day);
    if (key < v.startDate || (v.endDate && key > v.endDate)) continue;
    for (const t of v.timesOfDay) {
      const [h, m] = t.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at >= from && at < to) out.push(at);
    }
  }
  return out;
}

function events(list: TreatmentPlan[], from: Date, to: Date): DoseEvent[] {
  return list
    .flatMap((p) => doseTimes(p, from, to).map((at): DoseEvent => {
      const iso = at.toISOString();
      const mark = doseLog.get(`${p.id}|${iso}`);
      return { planId: p.id, planVersion: p.current.version, medicationName: p.current.medicationName, scheduledFor: iso,
        status: mark?.status ?? 'pending', recordedAt: mark?.recordedAt ?? null };
    }))
    .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1));
}

function regenerate(): { added: number; removed: number } {
  const { slots, taken } = mockCareStore;
  const step = schedule.slotMinutes * 60_000;
  const desired: { s: string; e: string }[] = [];
  const today = new Date();
  for (let d = 0; d <= schedule.horizonDays; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    const iso = day.getDay() === 0 ? 7 : day.getDay();
    const breaks = schedule.hours.filter((h) => h.kind === 'break' && h.weekday === iso);
    for (const w of schedule.hours.filter((h) => h.kind === 'work' && h.weekday === iso)) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em).getTime();
      for (let t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm).getTime(); t + step <= end; t += step) {
        const hhmm = (ms: number) => { const x = new Date(ms); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
        if (breaks.some((b) => b.start < hhmm(t + step) && hhmm(t) < b.end)) continue;
        if (t > Date.now()) desired.push({ s: new Date(t).toISOString(), e: new Date(t + step).toISOString() });
      }
    }
  }
  let removed = 0;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    if (s.doctorId !== DOCTOR_ID || s.source !== 'schedule' || s.startsAt <= nowIso() || taken(DOCTOR_ID, s.startsAt, s.endsAt)) continue;
    if (!desired.some((x) => x.s === s.startsAt && x.e === s.endsAt)) { slots.splice(i, 1); removed++; }
  }
  let added = 0;
  for (const x of desired) {
    if (slots.some((s) => s.doctorId === DOCTOR_ID && s.startsAt < x.e && x.s < s.endsAt)) continue;
    slots.push({ id: createId('slot'), doctorId: DOCTOR_ID, startsAt: x.s, endsAt: x.e, source: 'schedule' });
    added++;
  }
  return { added, removed };
}

const appt = (id: string): Appointment => {
  const a = mockCareStore.appointments.find((x) => x.id === id);
  if (!a) throw new ApiError('Not found', 404);
  return a;
};

function recordItems(deps: Deps, opts: { profile: boolean; documents: boolean; labs: boolean; viewerIsDoctor: boolean }): RecordItem[] {
  const rec = deps.record();
  const base = { detail: '', author: null, documentType: null, documentId: null, planId: null, status: null, pinned: false, relevanceReason: null } as const;
  const items: RecordItem[] = [];
  if (opts.profile) {
    rec.allergies.forEach((a) => items.push({ ...base, id: `allergy:${a.id}`, category: 'allergies', title: a.substance, detail: [a.reaction, a.severity].filter(Boolean).join(', '),
      date: null, source: 'medical_profile', verification: 'patient_declared', provenance: 'medical_profiles.allergies', pinned: true, relevanceReason: 'allergy_always' }));
    rec.diagnoses.forEach((d) => items.push({ ...base, id: `condition:${d.id}`, category: 'conditions', title: d.name, detail: [d.icd10, d.status].filter(Boolean).join(' · '),
      date: d.diagnosedAt, source: 'medical_profile', verification: 'patient_declared', provenance: 'medical_profiles.conditions', status: d.status }));
    rec.treatments.forEach((t) => items.push({ ...base, id: `declared_med:${t.id}`, category: 'medication', title: t.name, detail: [t.dosage, t.frequency].filter(Boolean).join(' · '),
      date: t.startDate, source: 'medical_profile', verification: 'patient_declared', provenance: 'medical_profiles.medications', status: t.active ? 'active' : 'stopped',
      pinned: t.active, relevanceReason: t.active ? 'active_treatment_always' : null }));
    (rec.surgeries ?? []).forEach((s) => items.push({ ...base, id: `surgery:${s.id}`, category: 'procedures', title: s.name, detail: s.notes, date: s.date,
      source: 'medical_profile', verification: 'patient_declared', provenance: 'medical_profiles.surgeries' }));
    plans.map((r) => toPlan(r, opts.viewerIsDoctor)).forEach((p) => items.push({ ...base, id: `plan:${p.id}`, category: 'medication', title: p.current.medicationName,
      detail: [p.current.strength, p.current.dosageForm, p.current.frequencyText].filter(Boolean).join(' · '), date: p.current.startDate, source: p.kind,
      author: p.prescriberName, verification: 'doctor_prescribed', provenance: 'treatment_plans', planId: p.id, status: p.status,
      pinned: p.status === 'ACTIVE', relevanceReason: p.status === 'ACTIVE' ? 'active_treatment_always' : null }));
  }
  if (opts.documents) {
    const cat: Record<string, RecordCategory> = { lab_result: 'labs', imaging_report: 'investigations', discharge_summary: 'hospitalizations', prescription: 'medication' };
    rec.documents.forEach((d) => items.push({ ...base, id: `document:${d.id}`, category: cat[d.type] ?? 'investigations', title: d.title,
      date: (d.eventDate ?? d.uploadedAt).slice(0, 10), source: 'uploaded_document', documentType: d.type, verification: 'document',
      provenance: 'medical_documents', documentId: d.id, isDemo: d.isDemo }));
    // Facts confirmed from imported documents (imported medication is historical: never pinned / active).
    const factCat: Partial<Record<string, RecordCategory>> = { diagnosis: 'conditions', allergy: 'allergies', medication: 'medication', procedure: 'procedures',
      investigation: 'investigations', vaccination: 'vaccinations', recommendation: 'recommendations', follow_up: 'recommendations' };
    mockDocumentFacts.forEach((f) => {
      const category = factCat[f.kind];
      if (!category) return;
      items.push({ ...base, id: `fact:${f.id}`, category, title: f.label, detail: f.detail ?? '', date: f.eventDate, source: 'document_fact',
        verification: 'document', provenance: 'document_facts', documentId: f.documentId, status: f.kind === 'medication' ? 'historical' : f.status,
        pinned: f.kind === 'allergy', relevanceReason: f.kind === 'allergy' ? 'allergy_always' : null, sourceExcerpt: f.sourceExcerpt, sourcePage: f.sourcePage, isDemo: true });
    });
  }
  mockCareStore.appointments.filter((a) => a.status === 'confirmed').forEach((a) => items.push({ ...base, id: `appointment:${a.id}`, category: 'consultations',
    title: mockCareStore.nameOf(a.specialtyId, 'ro') ?? a.doctorName ?? '', detail: a.doctorName ?? '', date: a.startsAt, source: 'appointment', author: a.doctorName,
    verification: 'booking', provenance: 'appointments', status: a.status }));
  return items;
}

const ORDER: RecordCategory[] = ['allergies', 'medication', 'conditions', 'procedures', 'labs', 'investigations', 'consultations', 'hospitalizations', 'recommendations', 'vaccinations', 'family_history'];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function organize(items: RecordItem[], view: OrganizedRecord['view'], reason: string | null): OrganizedRecord {
  const byDate = (a: RecordItem, b: RecordItem) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1);
  if (view === 'chronological') return { view, items: [...items].sort(byDate), sections: [], context: null, insufficient: false };
  if (view === 'category') {
    return { view, items: [], context: null, insufficient: false,
      sections: ORDER.map((c) => ({ category: c, items: items.filter((i) => i.category === c).sort(byDate) })).filter((s) => s.items.length) };
  }
  const stems = fold(reason ?? '').split(/\W+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 6));
  const pinned = items.filter((i) => i.pinned);
  const matched = items.filter((i) => !i.pinned && stems.some((s) => fold(`${i.title} ${i.detail}`).includes(s))).map((i) => ({ ...i, relevanceReason: 'matches_reason' as const }));
  const rest = items.filter((i) => !i.pinned && !matched.some((m) => m.id === i.id)).sort(byDate);
  return { view, items: [...pinned, ...matched.sort(byDate), ...rest], sections: [], context: reason?.trim() || null, insufficient: !!reason?.trim() && !matched.length };
}

const notConfigured = { status: 'not_configured' as const, generalSummary: null, patientSummary: null, clinicalSummary: null, consultationSummary: null,
  timeline: [], categories: {}, missingInformation: [], contradictions: [], terms: [], sources: [], insufficientSources: false, emergency: null,
  discardedStatements: 0, model: '', generatedAt: '' };

export function createMockCareJourney(deps: Deps): Pick<WWHealthApi,
  | 'getMySchedule' | 'saveMySchedule' | 'listMyTimeOff' | 'addTimeOff' | 'deleteTimeOff' | 'getAgenda' | 'getConsultation'
  | 'listPatientTreatments' | 'createTreatment' | 'updateTreatment' | 'endTreatment' | 'getPatientRecordView' | 'getPatientInsights'
  | 'getPreparation' | 'savePreparation' | 'getMyTreatments' | 'getMyTreatment' | 'getReminderSchedule' | 'markDose'
  | 'getMyRecordView' | 'getMyInsights' | 'exportMyFhir'> {
  const editable = (planId: string) => {
    const row = plans.find((r) => r.plan.id === planId);
    if (!row) throw new ApiError('Not found', 404);
    if (!deps.hasGrant('profile')) throw forbidden('The patient has not granted access to their medical profile');
    if (row.plan.storedStatus !== 'active') throw new ApiError('This item can no longer be changed', 409);
    return row;
  };
  return {
    async getMySchedule() { await delay(150); return schedule; },
    async saveMySchedule(next) {
      await delay(250);
      for (const [i, a] of next.hours.entries()) {
        if (a.end <= a.start) throw new ApiError('Invalid schedule: invalid_hours', 422);
        if (next.hours.slice(i + 1).some((b) => b.weekday === a.weekday && b.kind === a.kind && a.start < b.end && b.start < a.end)) {
          throw new ApiError('Invalid schedule: overlapping_hours', 422);
        }
      }
      schedule = { ...next, configured: true };
      return { ...regenerate(), schedule };
    },
    async listMyTimeOff() { await delay(150); return timeOff.filter((t) => t.endsAt > nowIso()); },
    async addTimeOff({ kind, startsAt, endsAt, note }) {
      await delay(200);
      if (!(endsAt > startsAt) || endsAt <= nowIso()) throw new ApiError('Invalid schedule: invalid_range', 422);
      const item: TimeOff = { id: createId('off'), kind, startsAt, endsAt, note: note?.trim() || null };
      timeOff.push(item);
      mockTimeOff.push({ doctorId: DOCTOR_ID, startsAt, endsAt });
      const conflicts = mockCareStore.appointments.filter((a) => a.doctorId === DOCTOR_ID && ['requested', 'confirmed', 'proposed'].includes(a.status)
        && a.startsAt < endsAt && startsAt < a.endsAt).length;
      return { timeOff: item, conflicts };
    },
    async deleteTimeOff(id) {
      await delay(150);
      const i = timeOff.findIndex((t) => t.id === id);
      if (i < 0) throw new ApiError('Not found', 404);
      const [t] = timeOff.splice(i, 1);
      const j = mockTimeOff.findIndex((x) => x.startsAt === t.startsAt && x.endsAt === t.endsAt);
      if (j >= 0) mockTimeOff.splice(j, 1);
    },
    async getAgenda(fromIso, toIso, language) {
      await delay(200);
      const { slots, appointments, taken, blocked, nameOf } = mockCareStore;
      return {
        startsAt: fromIso, endsAt: toIso,
        appointments: appointments
          .filter((a) => a.doctorId === DOCTOR_ID && ((a.startsAt < toIso && fromIso < a.endsAt) || (!!a.proposedStartsAt && a.proposedStartsAt < toIso && fromIso < (a.proposedEndsAt ?? ''))))
          .map((a) => ({ ...a, patientName: 'Maria Ionescu', specialtyName: nameOf(a.specialtyId, language), prepared: preparations.has(a.id) }))
          .sort((a, b) => ((a.proposedStartsAt ?? a.startsAt) < (b.proposedStartsAt ?? b.startsAt) ? -1 : 1)),
        slots: slots.filter((s) => s.doctorId === DOCTOR_ID && s.startsAt >= fromIso && s.startsAt < toIso).sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))
          .map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, booked: taken(DOCTOR_ID, s.startsAt, s.endsAt), blocked: blocked(DOCTOR_ID, s.startsAt, s.endsAt) })),
        timeOff: timeOff.filter((t) => t.startsAt < toIso && fromIso < t.endsAt),
      };
    },
    async getConsultation(appointmentId, language) {
      await delay(250);
      const a = appt(appointmentId);
      if (a.doctorId !== DOCTOR_ID) throw new ApiError('Not found', 404);
      const rec = deps.record();
      const profile = deps.hasGrant('profile');
      const any = profile || deps.hasGrant('documents') || deps.hasGrant('labs');
      const sheet: ConsultationSheet = {
        appointment: { ...a, patientName: 'Maria Ionescu', specialtyName: mockCareStore.nameOf(a.specialtyId, language) },
        preparation: preparations.get(appointmentId) ?? null,
        grant: any ? { status: 'active', scopes: (['profile', 'documents', 'labs'] as const).filter((s) => deps.hasGrant(s)), expiresAt: null } : null,
        allergies: profile ? rec.allergies : null, diagnoses: profile ? rec.diagnoses : null, surgeries: profile ? (rec.surgeries ?? []) : null,
        declaredMedication: profile ? rec.treatments : null, treatments: profile ? plans.map((r) => toPlan(r, true)) : null,
        labs: null, documents: deps.hasGrant('documents') ? rec.documents : null,
      };
      return sheet;
    },
    async listPatientTreatments() {
      await delay(200);
      if (!deps.hasGrant('profile')) throw forbidden('The patient has not granted access to their medical profile');
      return plans.map((r) => toPlan(r, true));
    },
    async createTreatment(body) {
      await delay(250);
      check(body);
      if (!deps.hasGrant('profile')) throw forbidden('The patient has not granted access to their medical profile');
      const row: Row = {
        plan: { id: createId('plan'), patientId: body.patientId, prescriberId: DOCTOR_ID, prescriberName: DOCTOR_NAME,
          appointmentId: body.appointmentId ?? null, kind: body.kind, storedStatus: 'active', issuedAt: nowIso() },
        versions: [version(body, 1, 'active', 'created', null)],
      };
      plans.push(row);
      return toPlan(row, true);
    },
    async updateTreatment(planId, body) {
      await delay(250);
      check(body);
      const row = editable(planId);
      row.versions.push(version(body, row.versions.length + 1, 'active', 'updated', body.reason ?? null));
      return toPlan(row, true);
    },
    async endTreatment(planId, status, reason) {
      await delay(250);
      const row = editable(planId);
      const last = row.versions[row.versions.length - 1];
      row.versions.push({ ...last, version: last.version + 1, status, changeKind: status, changeReason: reason?.trim() || null, changedByName: DOCTOR_NAME, changedAt: nowIso() });
      row.plan.storedStatus = status;
      return toPlan(row, true);
    },
    async getPatientRecordView(_patientId, view, appointmentId) {
      await delay(200);
      if (!deps.hasGrant('profile') && !deps.hasGrant('documents')) throw forbidden('The patient has not granted access to their medical profile');
      const reason = appointmentId ? preparations.get(appointmentId)?.reason ?? null : null;
      return organize(recordItems(deps, { profile: deps.hasGrant('profile'), documents: deps.hasGrant('documents'), labs: false, viewerIsDoctor: true }), view, reason);
    },
    async getPatientInsights() { await delay(300); return notConfigured; },
    async getPreparation(appointmentId) { await delay(120); appt(appointmentId); return preparations.get(appointmentId) ?? null; },
    async savePreparation(appointmentId, body) {
      await delay(200);
      const a = appt(appointmentId);
      if (!['requested', 'proposed', 'confirmed'].includes(a.status)) throw new ApiError('This item can no longer be changed', 409);
      const prep: Preparation = { reason: body.reason?.trim() || null, symptoms: body.symptoms?.trim() || null,
        questions: body.questions.map((q) => q.trim()).filter(Boolean).slice(0, 10), careSummary: body.careSummary ?? null, updatedAt: nowIso() };
      preparations.set(appointmentId, prep);
      return prep;
    },
    async getMyTreatments(timezone) {
      await delay(200);
      const list = plans.map((r) => toPlan(r, false));
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start.getTime() + 86_400_000);
      const upcoming = events(list, now, new Date(now.getTime() + 7 * 86_400_000));
      return { timezone, today: events(list, start, end), nextDose: upcoming.find((e) => e.status === 'pending') ?? null,
        active: list.filter((p) => p.status === 'ACTIVE'), upcoming: list.filter((p) => p.status === 'UPCOMING'),
        finished: list.filter((p) => ['COMPLETED', 'DISCONTINUED', 'CANCELLED'].includes(p.status)), declared: deps.record().treatments, isDemo: true };
    },
    async getMyTreatment(planId) {
      await delay(150);
      const row = plans.find((r) => r.plan.id === planId);
      if (!row) throw new ApiError('Not found', 404);
      return toPlan(row, false);
    },
    async getReminderSchedule(timezone) {
      await delay(150);
      const list = plans.map((r) => toPlan(r, false)).filter((p) => p.status === 'ACTIVE' || p.status === 'UPCOMING');
      const now = new Date();
      const doses = events(list, now, new Date(now.getTime() + 7 * 86_400_000)).filter((e) => e.status === 'pending').slice(0, 60);
      return { timezone, doses, plansHash: list.map((p) => `${p.id}:${p.current.version}:${p.storedStatus}`).sort().join('|') };
    },
    async markDose(planId, scheduledFor, status) {
      await delay(150);
      const row = plans.find((r) => r.plan.id === planId);
      if (!row) throw new ApiError('Not found', 404);
      const p = toPlan(row, false);
      const at = new Date(scheduledFor);
      if (!doseTimes(p, new Date(at.getTime() - 60_000), new Date(at.getTime() + 60_000)).length) throw new ApiError('Invalid scheduled_for', 422);
      const ev: DoseEvent = { planId, planVersion: p.current.version, medicationName: p.current.medicationName, scheduledFor: at.toISOString(), status, recordedAt: nowIso() };
      doseLog.set(`${planId}|${ev.scheduledFor}`, ev);
      return ev;
    },
    async getMyRecordView(view, appointmentId) {
      await delay(200);
      const reason = appointmentId ? preparations.get(appointmentId)?.reason ?? null : null;
      return organize(recordItems(deps, { profile: true, documents: true, labs: true, viewerIsDoctor: false }), view, reason);
    },
    async getMyInsights() { await delay(300); return notConfigured; },
    async exportMyFhir() {
      await delay(200);
      return { resourceType: 'Bundle', type: 'collection', entry: [], note: 'MOCK mode: the FHIR export is produced by the backend.' };
    },
  };
}
