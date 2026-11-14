import { router } from 'expo-router';
import { RefreshControl } from 'react-native';

import { AppText, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { MedicalSummaryView } from '@/screens/shared/components/MedicalSummaryView';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** The patient's own structured summary — exactly what a doctor sees when every section is shared. */
export function MedicalSummaryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMySummary, { refetchOnFocus: true });

  return (
    <ScreenContainer edges={['bottom']} refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <AppText color="textMuted">{t('consent.summary.previewIntro')}</AppText>
      {isLoading && !data && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <MedicalSummaryView
          summary={data}
          onOpenDocument={(doc) => router.push({ pathname: '/patient/document/[id]', params: { id: doc.id } })}
        />
      )}
    </ScreenContainer>
  );
}
