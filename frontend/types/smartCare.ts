/** Smart Care — AI specialty recommendation (optional) + appointments with verified doctors. Mirrors backend schemas/smart_care.py. */

export type Language = 'ro' | 'en';

export interface Specialty {
  id: string;
  name: string;
}

export interface ClarificationAnswer {
  question: string;
  answer: string;
}

export interface TriageRequest {
  /** Text the patient typed or the voice transcript they checked. */
  symptoms: string;
  source: 'text' | 'voice';
  confirmed: boolean;
  /** Only with the patient's choice: active conditions, allergies, active medication (no name). */
  useHistory: boolean;
  answers: ClarificationAnswer[];
  language: Language;
}

/** ElevenLabs transcript (no Gemini). isDemo only in demo / MOCK mode. */
export interface Transcript {
  transcript: string;
  language: string | null;
  isDemo: boolean;
}

export interface SuggestedSpecialty extends Specialty {
  reason: string;
}

/** Rule-based, never from Gemini. call_112: call 112 now · urgent: urgent care today. */
export interface EmergencyGuidance {
  level: 'call_112' | 'urgent';
  codes: string[];
}

export interface TriageResult {
  status: 'ok' | 'emergency' | 'no_consent' | 'not_configured' | 'failed';
  aiUsed: boolean;
  historyUsed: boolean;
  symptomSummary: string;
  specialties: SuggestedSpecialty[];
  reasoning: string;
  clarificationQuestions: string[];
  warningSigns: string[];
  recommendedNextStep: string;
  emergency: EmergencyGuidance | null;
  discarded: number;
  /** Only with status 'failed' (content-free). */
  failureReason?: 'timeout' | 'busy' | 'invalid' | 'error' | null;
}

export interface CareDoctor {
  id: string;
  fullName: string;
  doctorCode: string | null;
  nextSlot: string | null;
  freeSlots: number;
}

export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'rejected' | 'proposed' | 'cancelled';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  patientName: string | null;
  doctorName: string | null;
  specialtyId: string | null;
  specialtyName: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  patientNote: string | null;
  doctorNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentRequest {
  slotId: string;
  specialtyId: string | null;
  note: string | null;
}

export type PatientAppointmentAction = 'accept_proposal' | 'decline_proposal' | 'cancel';

export interface DoctorAppointmentAction {
  action: 'accept' | 'reject' | 'propose';
  slotId?: string | null;
  note?: string | null;
}

export interface AvailabilityCreate {
  startsAt: string;
  endsAt: string;
  slotMinutes: 15 | 20 | 30 | 45 | 60;
}
