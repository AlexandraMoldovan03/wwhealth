/** Error thrown by the API client for any failed request. */
import { i18n } from '@/i18n';

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
    if (this.status === 401 || this.status === 403) return i18n.t('errors.forbidden');
    if (this.status === 404 && this.message === 'Patient not found') return i18n.t('errors.profileMissing');
    if (this.status === 404) return i18n.t('errors.notFound');
    if (this.status === 422) return i18n.t('errors.invalidData');
    if (this.status >= 500) return i18n.t('errors.server');
    return this.message;
  }
}
