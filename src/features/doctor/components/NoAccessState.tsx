import { router } from 'expo-router';

import { EmptyState } from '@/components/ui';
import { useTranslation } from 'react-i18next';

export function NoAccessState() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="lock-closed-outline"
      title={t('doctor.expiredTitle')}
      message={t('doctor.expiredHint')}
      actionLabel={t('doctor.scanQr')}
      onAction={() => router.replace('/doctor/scan')}
    />
  );
}
