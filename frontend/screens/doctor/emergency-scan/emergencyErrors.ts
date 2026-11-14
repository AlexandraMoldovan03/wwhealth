import { i18n } from '@/i18n';
import { ApiError } from '@/services/api/ApiError';
import { getErrorMessage } from '@/utils/errors';

/** Backend rejection of a scanned emergency code → message for the doctor. */
export function emergencyRedeemError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return i18n.t('emergency.errors.notDoctor');
    if (error.status === 404) return i18n.t('emergency.errors.invalid');
    if (error.status === 409) return i18n.t('emergency.errors.used');
    if (error.status === 410) return i18n.t('emergency.errors.expired');
  }
  return getErrorMessage(error);
}
