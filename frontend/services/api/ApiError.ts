/** Error thrown by the API client for any failed request. */
import { i18n } from '@/i18n';

/**
 * Backend `detail` texts (English, technical) → translated messages. Matched by prefix, so details with
 * variable tails ("LungVision is not available on this server: …") still map. Unknown details never reach
 * the UI raw: they fall back to a translated message for the status code.
 */
const KNOWN_DETAILS: readonly [string, string][] = [
  ['Patient not found', 'errors.profileMissing'],
  ['Enter a valid email address', 'errors.api.invalidEmail'],
  ['You cannot add yourself', 'errors.api.inviteSelf'],
  ['This person is already invited', 'errors.api.inviteDuplicate'],
  ['You can add at most 5 emergency contacts', 'errors.api.inviteLimit'],
  ['Emergency contact not found', 'errors.api.guardianNotFound'],
  ['Invitation not found', 'errors.api.invitationNotFound'],
  ['Emergency passport not available', 'errors.api.passportUnavailable'],
  ['Doctor account required', 'errors.api.doctorRequired'],
  ['Empty audio file', 'errors.api.emptyAudio'],
  ['No speech detected', 'errors.api.noSpeech'],
  ['Audio file too large', 'errors.api.audioTooLarge'],
  ['File too large', 'errors.api.fileTooLarge'],
  ['file_too_large', 'errors.api.fileTooLarge'],
  ['Unsupported file type', 'errors.api.unsupportedFile'],
  ['unsupported_format', 'errors.api.unsupportedFile'],
  ['empty_file', 'errors.api.emptyFile'],
  ['invalid_document', 'errors.api.invalidDocument'],
  ['This item can no longer be changed', 'errors.api.locked'],
  ['Too many', 'errors.api.tooManyRequests'],
  ['Gemini is busy', 'errors.api.aiBusy'],
  ['AI is not configured', 'errors.api.aiNotConfigured'],
  ['Voice is not configured', 'errors.api.voiceNotConfigured'],
  ['LungVision is not available', 'errors.api.lungUnavailable'],
  ['Surgical history is not set up', 'errors.api.surgeriesNotSetUp'],
  ['Document scanning needs the backend', 'errors.api.needsBackend'],
  ['Export is available with the WWHealth server only', 'errors.api.needsBackend'],
  ['Sharing is not available', 'errors.api.sharingUnavailable'],
  ['Recent sign-in required', 'errors.api.reauthRequired'],
  ['Two-factor verification required', 'errors.api.mfaRequired'],
  ['Two-factor authentication required for doctor accounts', 'errors.api.doctorMfaRequired'],
  ['Confirmation cancelled', 'errors.api.confirmationCancelled'],
  ['Authentication service unavailable', 'errors.api.authUnavailable'],
];

const STATUS_FALLBACK: Record<number, string> = {
  400: 'errors.api.badRequest', 409: 'errors.api.conflict', 410: 'errors.api.gone', 413: 'errors.api.fileTooLarge',
  415: 'errors.api.unsupportedFile', 429: 'errors.api.tooManyRequests', 503: 'errors.api.notSetUp',
};

export class ApiError extends Error {
  /** HTTP status code, or 0 for network / timeout errors. */
  readonly status: number;
  /** Parsed response body, if any (FastAPI puts details in `detail`). */
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Message safe to show in the UI. */
  get userMessage(): string {
    if (this.isNetworkError) return this.message === i18n.t('errors.timeout') ? this.message : i18n.t('errors.network');
    const known = KNOWN_DETAILS.find(([prefix]) => this.message.startsWith(prefix));
    if (known) return i18n.t(known[1]);
    if (this.status === 401 || this.status === 403) return i18n.t('errors.forbidden');
    if (this.status === 404) return i18n.t('errors.notFound');
    if (this.status === 422) return i18n.t('errors.invalidData');
    // 502 / 504 only come from AI / external services (Gemini, ElevenLabs): say so instead of "server problem".
    if (this.status === 502) return i18n.t('errors.aiFailed');
    if (this.status === 504) return i18n.t('errors.aiTimeout');
    if (STATUS_FALLBACK[this.status]) return i18n.t(STATUS_FALLBACK[this.status]);
    if (this.status >= 500) return i18n.t('errors.server');
    return i18n.t('errors.status', { status: this.status });
  }
}
