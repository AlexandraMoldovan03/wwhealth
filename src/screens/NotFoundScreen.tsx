import { router } from 'expo-router';

import { EmptyState, ScreenContainer } from '@/components/ui';
import { useTranslation } from 'react-i18next';

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <ScreenContainer scroll={false}>
      <EmptyState
        icon="help-circle-outline"
        title={t('notFound.title')}
        message={t('notFound.message')}
        actionLabel={t('notFound.home')}
        onAction={() => router.replace('/')}
      />
    </ScreenContainer>
  );
}
