import type { TFunction } from 'i18next';

import { i18n } from '@/i18n';
import { ApiError } from '@/services/api/ApiError';
import { getErrorMessage } from '@/utils/errors';

/** The backend's safe error code (e.g. "csv_mapping_required"), if any. */
export function importErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const detail = (err.body as { detail?: unknown } | null)?.detail;
  return typeof detail === 'string' ? detail : null;
}

export function importErrorMessage(err: unknown, t: TFunction): string {
  const code = importErrorCode(err);
  if (code && i18n.exists(`smart.errors.${code}`)) return t(`smart.errors.${code}`);
  return getErrorMessage(err);
}
