/**
 * The last Smart Care result of this app session, kept IN MEMORY only (never persisted, never sent anywhere by itself).
 * The patient may choose to attach it to a consultation preparation — explicit action, shown before saving.
 */
import type { CareSummaryAttachment } from '@/types';

let draft: CareSummaryAttachment | null = null;

export const setCareSummaryDraft = (value: CareSummaryAttachment | null) => {
  draft = value && value.symptomSummary.trim() ? value : null;
};
export const getCareSummaryDraft = () => draft;

let intakeDraft: { userId: string; symptoms: string } | null = null;

export function setIntakeBookingDraft(userId: string, symptoms: string) {
  intakeDraft = { userId, symptoms };
}

export function getIntakeBookingDraft(userId?: string) {
  return intakeDraft?.userId === userId ? intakeDraft : null;
}

export function clearIntakeBookingDraft(draft: ReturnType<typeof getIntakeBookingDraft>) {
  if (intakeDraft === draft) intakeDraft = null;
}
