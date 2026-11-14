/** Client-side form checks. The backend must validate again — this is only for UX. */
import { i18n } from '@/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return i18n.t('validation.emailRequired');
  if (!EMAIL_RE.test(email.trim())) return i18n.t('validation.emailInvalid');
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return i18n.t('validation.passwordRequired');
  if (password.length < MIN_PASSWORD_LENGTH) return i18n.t('validation.passwordMin', { count: MIN_PASSWORD_LENGTH });
  return undefined;
}

export function validateRequired(value: string, label: string): string | undefined {
  return value.trim() ? undefined : i18n.t('validation.required', { label });
}

/** True when every value in an errors object is undefined. */
export function isValid(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).every((e) => !e);
}
