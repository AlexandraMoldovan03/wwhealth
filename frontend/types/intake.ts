export interface Symptom {
  name: string;
  duration: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  notes: string | null;
}

export interface IntakeForm {
  transcript: string;
  language: string | null;
  summary: string;
  symptoms: Symptom[];
  medicationsMentioned: string[];
  allergiesMentioned: string[];
  urgentWarning: boolean;
  isDemo: boolean;
  disclaimer: string;
}
