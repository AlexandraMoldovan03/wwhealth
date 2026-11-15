/**
 * MOCK mode — Smart Care with the same rules as the backend demo store (backend/app/services/appointment_service.py).
 * No AI here: the recommendation answers "not configured" (or the emergency rules), so nothing medical is invented.
 * In MOCK mode the app is both the demo patient and the demo doctor (doc_demo_001), so the whole flow fits one phone.
 */
import { MOCK_DELAY_MS } from '@/config/config';
import { ApiError } from '@/services/api/ApiError';
import type { Appointment, CareDoctor, Language, Slot, Specialty, WWHealthApi } from '@/types';
import { createId, delay } from '@/utils/async';

/** Same ids as backend specialty_catalog.py (subset of names is enough for the demo). */
const SPECIALTIES: [string, string, string][] = [
  ['family_medicine', 'Medicină de familie', 'Family medicine'],
  ['internal_medicine', 'Medicină internă', 'Internal medicine'],
  ['cardiology', 'Cardiologie', 'Cardiology'],
  ['pulmonology', 'Pneumologie', 'Pulmonology'],
  ['gastroenterology', 'Gastroenterologie', 'Gastroenterology'],
  ['neurology', 'Neurologie', 'Neurology'],
  ['dermatology', 'Dermatologie', 'Dermatology'],
  ['ent', 'ORL', 'ENT'],
  ['ophthalmology', 'Oftalmologie', 'Ophthalmology'],
  ['endocrinology', 'Endocrinologie', 'Endocrinology'],
  ['orthopedics', 'Ortopedie', 'Orthopaedics'],
  ['allergology', 'Alergologie', 'Allergology'],
  ['psychiatry', 'Psihiatrie', 'Psychiatry'],
  ['pediatrics', 'Pediatrie', 'Paediatrics'],
];
const DOCTORS = [
  { id: 'doc_demo_001', fullName: 'Dr. Alex Test', doctorCode: 'DR-DEMO01', specialties: ['family_medicine', 'internal_medicine', 'cardiology'] },
  { id: 'doc_demo_002', fullName: 'Dr. Ana Exemplu', doctorCode: 'DR-DEMO02', specialties: ['pulmonology', 'allergology', 'family_medicine'] },
  { id: 'doc_demo_003', fullName: 'Dr. Radu Test', doctorCode: 'DR-DEMO03', specialties: ['neurology', 'orthopedics', 'gastroenterology'] },
];
const PATIENT_ID = 'pat_demo_001';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameOf = (id: string | null, lang: Language) => {
  const row = SPECIALTIES.find((s) => s[0] === id);
  return row ? (lang === 'en' ? row[2] : row[1]) : null;
};

type MockSlot = Slot & { doctorId: string; source?: 'manual' | 'schedule' };
const slots: MockSlot[] = [];
const appointments: Appointment[] = [];

(function seed() {
  const base = new Date();
  base.setUTCHours(7, 0, 0, 0);
  for (const doc of DOCTORS.slice(0, 2)) {
    for (let day = 1; day <= 10; day++) {
      const d = new Date(base.getTime() + day * 86_400_000);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      for (let k = 0; k < 4; k++) {
        const start = new Date(d.getTime() + (30 * k + (doc.id === 'doc_demo_002' ? 60 : 0)) * 60_000);
        slots.push({ id: createId('slot'), doctorId: doc.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60_000).toISOString() });
      }
    }
  }
})();

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;
function taken(doctorId: string, start: string, end: string, ignore?: string) {
  return appointments.some((a) => {
    if (a.id === ignore || a.doctorId !== doctorId) return false;
    if ((a.status === 'requested' || a.status === 'confirmed') && overlaps(a.startsAt, a.endsAt, start, end)) return true;
    return a.status === 'proposed' && !!a.proposedStartsAt && !!a.proposedEndsAt && overlaps(a.proposedStartsAt, a.proposedEndsAt, start, end);
  });
}
const nowIso = () => new Date().toISOString();
/** Days off / blocked intervals (set by mockCareJourney). */
export const mockTimeOff: { doctorId: string; startsAt: string; endsAt: string }[] = [];
const blocked = (doctorId: string, start: string, end: string) =>
  mockTimeOff.some((t) => t.doctorId === doctorId && overlaps(t.startsAt, t.endsAt, start, end));
const free = (doctorId: string) =>
  slots
    .filter((s) => s.doctorId === doctorId && s.startsAt > nowIso() && !taken(doctorId, s.startsAt, s.endsAt) && !blocked(doctorId, s.startsAt, s.endsAt))
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
const plain = ({ id, startsAt, endsAt }: MockSlot): Slot => ({ id, startsAt, endsAt });
const withNames = (a: Appointment, lang: Language): Appointment => ({ ...a, specialtyName: nameOf(a.specialtyId, lang) });
const find = (id: string) => {
  const a = appointments.find((x) => x.id === id);
  if (!a) throw new ApiError('Not found', 404);
  return a;
};
const conflict = (msg = 'This slot is no longer available') => new ApiError(msg, 409);

/** Same red-flag idea as backend triage_safety.py (smaller list; the backend is the reference). */
const RED_FLAGS: [string, RegExp][] = [
  ['chest_pain', /(durere|apasare)\w* (puternic\w* )?(in|de) piept|chest pain/],
  ['breathing', /nu (mai )?pot (sa )?respir|sufoc|can'?t breathe/],
  ['stroke', /(gura|fata) stramb|vorbesc greu|slurred speech/],
  ['unconscious', /lesin|inconstien|fainted|unconscious/],
];

export const mockSmartCare: Pick<
  WWHealthApi,
  | 'listSpecialties' | 'transcribeSymptoms' | 'triageSymptoms' | 'listSpecialtyDoctors' | 'listDoctorSlots' | 'requestAppointment' | 'listMyAppointments'
  | 'updateMyAppointment' | 'listDoctorAppointments' | 'respondAppointment' | 'listMyAvailability' | 'listMyFreeSlots'
  | 'addAvailability' | 'deleteAvailability'
> = {
  async listSpecialties(query, language) {
    await delay(150);
    const q = fold(query.trim());
    return SPECIALTIES.filter((s) => !q || fold(s[1]).includes(q) || fold(s[2]).includes(q)).map(
      ([id]): Specialty => ({ id, name: nameOf(id, language) ?? id }),
    );
  },

  async transcribeSymptoms() {
    await delay(MOCK_DELAY_MS);
    return { transcript: 'Tusesc de două săptămâni, mai ales noaptea, și obosesc repede.', language: 'ro', isDemo: true };
  },

  async triageSymptoms(request) {
    await delay(MOCK_DELAY_MS);
    const text = fold([request.symptoms, ...request.answers.map((a) => a.answer)].join(' '));
    const codes = RED_FLAGS.filter(([, rx]) => rx.test(text) && !/\b(nu am|fara|no)\b/.test(text)).map(([c]) => c);
    const empty = { aiUsed: false, historyUsed: false, symptomSummary: '', specialties: [], reasoning: '', clarificationQuestions: [],
      warningSigns: [], recommendedNextStep: '', discarded: 0 };
    if (codes.length) return { ...empty, status: 'emergency', emergency: { level: 'call_112', codes } };
    return { ...empty, status: 'not_configured', emergency: null };
  },

  async listSpecialtyDoctors(specialtyId) {
    await delay(MOCK_DELAY_MS);
    return DOCTORS.filter((d) => d.specialties.includes(specialtyId)).map((d): CareDoctor => {
      const f = free(d.id);
      return { id: d.id, fullName: d.fullName, doctorCode: d.doctorCode, nextSlot: f[0]?.startsAt ?? null, freeSlots: f.length };
    });
  },

  async listDoctorSlots(doctorId) {
    await delay(MOCK_DELAY_MS);
    return free(doctorId).map(plain);
  },

  async requestAppointment(request, language) {
    await delay(MOCK_DELAY_MS);
    const slot = slots.find((s) => s.id === request.slotId);
    if (!slot) throw new ApiError('Not found', 404);
    if (slot.startsAt <= nowIso() || taken(slot.doctorId, slot.startsAt, slot.endsAt) || blocked(slot.doctorId, slot.startsAt, slot.endsAt)) throw conflict();
    const at = nowIso();
    const appt: Appointment = {
      id: createId('appt'), patientId: PATIENT_ID, doctorId: slot.doctorId, patientName: null,
      doctorName: DOCTORS.find((d) => d.id === slot.doctorId)?.fullName ?? null, specialtyId: request.specialtyId, specialtyName: null,
      startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'requested', proposedStartsAt: null, proposedEndsAt: null,
      patientNote: request.note?.trim() || null, doctorNote: null, createdAt: at, updatedAt: at,
    };
    appointments.push(appt);
    return withNames(appt, language);
  },

  async listMyAppointments(language) {
    await delay(MOCK_DELAY_MS);
    return appointments.map((a) => withNames(a, language)).sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  },

  async updateMyAppointment(appointmentId, action, language) {
    await delay(MOCK_DELAY_MS);
    const a = find(appointmentId);
    if (action === 'accept_proposal') {
      if (a.status !== 'proposed' || !a.proposedStartsAt || !a.proposedEndsAt) throw conflict('The appointment can no longer be changed');
      if (a.proposedStartsAt <= nowIso() || taken(a.doctorId, a.proposedStartsAt, a.proposedEndsAt, a.id)) throw conflict();
      Object.assign(a, { startsAt: a.proposedStartsAt, endsAt: a.proposedEndsAt, status: 'confirmed' });
    } else if (action === 'decline_proposal') {
      if (a.status !== 'proposed') throw conflict('The appointment can no longer be changed');
      a.status = 'cancelled';
    } else {
      if (!['requested', 'confirmed', 'proposed'].includes(a.status)) throw conflict('The appointment can no longer be changed');
      a.status = 'cancelled';
    }
    Object.assign(a, { proposedStartsAt: null, proposedEndsAt: null, updatedAt: nowIso() });
    return withNames(a, language);
  },

  async listDoctorAppointments(language) {
    await delay(MOCK_DELAY_MS);
    return appointments
      .filter((a) => a.doctorId === DOCTORS[0].id)
      .map((a) => ({ ...withNames(a, language), patientName: 'Maria Ionescu' }))
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  },

  async respondAppointment(appointmentId, { action, slotId, note }, language) {
    await delay(MOCK_DELAY_MS);
    const a = find(appointmentId);
    if (a.doctorId !== DOCTORS[0].id) throw new ApiError('Not found', 404);
    if (a.status !== 'requested') throw conflict('The appointment can no longer be changed');
    if (action === 'accept') a.status = 'confirmed';
    else if (action === 'reject') a.status = 'rejected';
    else {
      const slot = slots.find((s) => s.id === slotId && s.doctorId === a.doctorId);
      if (!slot || slot.startsAt <= nowIso() || taken(a.doctorId, slot.startsAt, slot.endsAt, a.id)) throw conflict();
      Object.assign(a, { status: 'proposed', proposedStartsAt: slot.startsAt, proposedEndsAt: slot.endsAt });
    }
    Object.assign(a, { doctorNote: note?.trim() || null, updatedAt: nowIso() });
    return { ...withNames(a, language), patientName: 'Maria Ionescu' };
  },

  async listMyAvailability() {
    await delay(200);
    return slots.filter((s) => s.doctorId === DOCTORS[0].id && s.startsAt > nowIso()).sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1)).map(plain);
  },

  async listMyFreeSlots() {
    await delay(200);
    return free(DOCTORS[0].id).map(plain);
  },

  async addAvailability({ startsAt, endsAt, slotMinutes }) {
    await delay(200);
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    if (!(end > start) || start <= Date.now() || end - start > 12 * 3_600_000) throw new ApiError('Invalid range', 422);
    let added = 0;
    for (let t = start; t + slotMinutes * 60_000 <= end; t += slotMinutes * 60_000) {
      const s = new Date(t).toISOString();
      if (slots.some((x) => x.doctorId === DOCTORS[0].id && x.startsAt === s)) continue;
      slots.push({ id: createId('slot'), doctorId: DOCTORS[0].id, startsAt: s, endsAt: new Date(t + slotMinutes * 60_000).toISOString() });
      added++;
    }
    return { added };
  },

  async deleteAvailability(slotId) {
    await delay(200);
    const i = slots.findIndex((s) => s.id === slotId && s.doctorId === DOCTORS[0].id);
    if (i < 0) throw new ApiError('Not found', 404);
    slots.splice(i, 1);
  },
};

/** Shared with mockCareJourney (agenda, schedule, consultation) — same in-memory store, MOCK mode only. */
export const mockCareStore = { slots, appointments, taken, blocked, DOCTORS, PATIENT_ID, nameOf };
