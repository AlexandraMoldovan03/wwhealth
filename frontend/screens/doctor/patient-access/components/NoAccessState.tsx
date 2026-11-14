import { router } from 'expo-router';

import { EmptyState } from '@/design-system';
import type { OpenStatus } from '@/types';
import { useTranslation } from 'react-i18next';

const ICON = {
  none: 'lock-closed-outline',
  expired: 'time-outline',
  revoked: 'close-circle-outline',
  forbidden: 'shield-outline',
} as const;

/** Why the doctor sees nothing: no consent, consent expired, revoked by the patient, or not a doctor account. */
export function NoAccessState({ status, patientName }: { status: Exclude<OpenStatus, 'ok'>; patientName?: string | null }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={ICON[status]}
      title={t(`consent.doctor.denied.${status}.title`)}
      message={t(`consent.doctor.denied.${status}.message`, { name: patientName ?? t('consent.doctor.thePatient') })}
      actionLabel={t('consent.doctor.backToPatients')}
      onAction={() => router.navigate('/patients')}
    />
  );
}
