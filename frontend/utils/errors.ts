import { ApiError } from '@/services/api/ApiError';
import { i18n } from '@/i18n';

/** Turns any thrown value into a message that is safe to show to the user. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return i18n.t('errors.generic');
}
