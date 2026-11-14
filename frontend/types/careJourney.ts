/**
 * Care Journey — doctor agenda & schedule, consultation preparation / sheet, treatment plans, doses, intelligent record,
 * AI care insights. Mirrors backend/app/schemas/care.py. A WWHealth prescription is NOT an official CNAS e-prescription.
 */
import type { Allergy, Diagnosis, MedicalDocument, Surgery, Treatment } from './medical';
import type { DoctorScope } from './consent';
import type { PatientLabValue } from './labs';
import type { Appointment, EmergencyGuidance } from './smartCare';

// ───────── schedule (doctor)
export interface WeeklyHours {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  kind: 'work' | 'break';
  start: string;
  end: string;
}

export interface DoctorSchedule {
  timezone: string;
  slotMinutes: 15 | 20 | 30 | 45 | 60;
  horizonDays: number;
  hours: WeeklyHours[];
  configured: boolean;
}

export interface ScheduleSaveResult {
  added: number;
  removed: number;
  schedule: DoctorSchedule;
}

export type TimeOffKind = 'day_off' | 'vacation' | 'blocked';

export interface TimeOff {
  id: string;
  kind: TimeOffKind;
  startsAt: string;
  endsAt: string;
  note: string | null;
}

export interface TimeOffCreate {
  kind: TimeOffKind;
  startsAt: string;
  endsAt: string;
  note?: string | null;
}

export interface TimeOffResult {
  timeOff: TimeOff;
  /** Existing appointments in that interval — never cancelled automatically. */
  conflicts: number;
}

export interface AgendaSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  booked: boolean;
  blocked: boolean;
}

export interface AgendaAppointment extends Appointment {
  prepared: boolean;
}

export interface DoctorAgenda {
  startsAt: string;
  endsAt: string;
  appointments: AgendaAppointment[];
  slots: AgendaSlot[];
  timeOff: TimeOff[];
}

// ───────── consultation
export interface CareSummaryAttachment {
  symptomSummary: string;
  specialties: string[];
}

export interface PreparationInput {
  reason: string | null;
  symptoms: string | null;
  questions: string[];
  careSummary?: CareSummaryAttachment | null;
}

export interface Preparation extends PreparationInput {
  updatedAt: string | null;
}

export interface GrantInfo {
  status: 'active' | 'expired' | 'revoked';
  scopes: DoctorScope[];
  expiresAt: string | null;
}

export interface ConsultationSheet {
  appointment: Appointment;
  preparation: Preparation | null;
  grant: GrantInfo | null;
  /** null = section not shared by the patient. */
  allergies: Allergy[] | null;
  diagnoses: Diagnosis[] | null;
  surgeries: Surgery[] | null;
  declaredMedication: Treatment[] | null;
  treatments: TreatmentPlan[] | null;
  labs: PatientLabValue[] | null;
  documents: MedicalDocument[] | null;
}

// ───────── treatments
export type PlanKind = 'prescription' | 'instructions';
export type TreatmentStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED';
export type ScheduleType = 'fixed_times' | 'as_needed' | 'undocumented';

export interface PlanVersionInput {
  medicationName: string;
  activeSubstance?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  doseAmount?: number | null;
  doseUnit?: string | null;
  route?: string | null;
  scheduleType: ScheduleType;
  timesOfDay: string[];
  frequencyText?: string | null;
  startDate: string;
  endDate?: string | null;
  instructions?: string | null;
}

export interface TreatmentCreate extends PlanVersionInput {
  patientId: string;
  kind: PlanKind;
  appointmentId?: string | null;
}

export interface TreatmentUpdate extends PlanVersionInput {
  reason?: string | null;
}

export interface TreatmentVersion extends Required<Omit<PlanVersionInput, 'timesOfDay'>> {
  version: number;
  timesOfDay: string[];
  status: 'active' | 'discontinued' | 'cancelled';
  changeKind: 'created' | 'updated' | 'discontinued' | 'cancelled';
  changeReason: string | null;
  changedByName: string;
  changedAt: string;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  prescriberId: string | null;
  prescriberName: string;
  appointmentId: string | null;
  kind: PlanKind;
  storedStatus: 'active' | 'discontinued' | 'cancelled';
  status: TreatmentStatus;
  issuedAt: string;
  current: TreatmentVersion;
  history: TreatmentVersion[];
  canEdit: boolean;
}

export interface DoseEvent {
  planId: string;
  planVersion: number;
  medicationName: string;
  scheduledFor: string;
  status: 'pending' | 'taken' | 'skipped';
  recordedAt: string | null;
}

export interface TreatmentOverview {
  timezone: string;
  today: DoseEvent[];
  nextDose: DoseEvent | null;
  active: TreatmentPlan[];
  upcoming: TreatmentPlan[];
  finished: TreatmentPlan[];
  /** Declared by the patient in the medical profile (not prescribed in WWHealth). */
  declared: Treatment[];
  isDemo: boolean;
}

export interface DoseSchedule {
  timezone: string;
  doses: DoseEvent[];
  plansHash: string;
}

// ───────── intelligent record
export type RecordView = 'relevance' | 'chronological' | 'category';
export type RecordCategory =
  | 'conditions' | 'procedures' | 'medication' | 'allergies' | 'labs' | 'investigations' | 'consultations'
  | 'hospitalizations' | 'vaccinations' | 'family_history' | 'recommendations';
export type Verification = 'patient_declared' | 'doctor_prescribed' | 'document' | 'patient_confirmed_lab' | 'ai_screening' | 'booking';

export interface RecordItem {
  id: string;
  category: RecordCategory;
  title: string;
  detail: string;
  date: string | null;
  source: string;
  author: string | null;
  documentType: string | null;
  verification: Verification;
  provenance: string;
  documentId: string | null;
  planId: string | null;
  status: string | null;
  pinned: boolean;
  relevanceReason: 'allergy_always' | 'active_treatment_always' | 'matches_reason' | 'matches_specialty' | null;
  /** Smart Import facts: exact quote + page of the source document. */
  sourceExcerpt?: string | null;
  sourcePage?: number | null;
  isDemo?: boolean;
}

export interface OrganizedRecord {
  view: RecordView;
  items: RecordItem[];
  sections: { category: RecordCategory; items: RecordItem[] }[];
  context: string | null;
  insufficient: boolean;
}

// ───────── AI care insights
export interface InsightStatement {
  text: string;
  sourceIds: string[];
}

export interface CareInsights {
  status: 'ok' | 'emergency' | 'no_consent' | 'not_configured' | 'forbidden' | 'expired' | 'revoked' | 'none';
  generalSummary: InsightStatement | null;
  patientSummary: InsightStatement | null;
  clinicalSummary: InsightStatement | null;
  consultationSummary: InsightStatement | null;
  timeline: { date: string; title: string; sourceIds: string[] }[];
  categories: Record<string, string[]>;
  missingInformation: string[];
  contradictions: InsightStatement[];
  terms: { term: string; explanation: string }[];
  sources: { id: string; kind: string; label: string; date: string | null; documentId: string | null }[];
  insufficientSources: boolean;
  emergency: EmergencyGuidance | null;
  discardedStatements: number;
  model: string;
  generatedAt: string;
}
