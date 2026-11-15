export interface Symptom {
  name: string;
  duration: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  notes: string | null;
}

/**
 * Translation of a voice transcript into the app language (Gemini; ElevenLabs only transcribes).
 * The transcript itself is never changed. `uncertainParts`: fragments (original wording) to double-check.
 */
export interface VoiceTranslation {
  status: 'same_language' | 'translated' | 'uncertain' | 'unknown_language' | 'unavailable';
  sourceLanguage: string | null;
  targetLanguage: 'ro' | 'en';
  text: string | null;
  uncertainParts: string[];
}

export interface IntakeForm {
  /** What the patient said, in the language they spoke (ElevenLabs Scribe). */
  transcript: string;
  /** Detected language (ISO 639-1 when known, e.g. "es"). */
  language: string | null;
  languageProbability?: number | null;
  translation?: VoiceTranslation | null;
  summary: string;
  symptoms: Symptom[];
  medicationsMentioned: string[];
  allergiesMentioned: string[];
  urgentWarning: boolean;
  isDemo: boolean;
  disclaimer: string;
}
