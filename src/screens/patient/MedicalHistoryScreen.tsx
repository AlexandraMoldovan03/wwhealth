import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { MedicalEventList } from '@/features/history/components/MedicalEventList';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import type { MedicalEvent } from '@/types';
import { useTranslation } from 'react-i18next';

const FILTERS = ['all', 'document', 'xray', 'diagnosis', 'treatment'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Medical Timeline tab — built from real data in GET /api/v1/patients/me:
 * uploaded documents, saved LungVision results, conditions and medication. No synthetic entries.
 */
export function MedicalHistoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const [filter, setFilter] = useState<Filter>('all');


  const events = useMemo(
    () => [...(data?.history ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)).filter((e) => filter === 'all' || e.type === filter),
    [data, filter],
  );

  // Documents open directly; other entries show their details.
  const open = (e: MedicalEvent) =>
    e.documentId
      ? router.push({ pathname: '/patient/document/[id]', params: { id: e.documentId } })
      : router.push({ pathname: '/history/[id]', params: { id: e.id } });

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('history.title')}
        </AppText>
        <AppText color="textMuted">{t('history.subtitle')}</AppText>
      </View>
      <CategoryFilter options={FILTERS} value={filter} onChange={setFilter} getLabel={(f) => (f === 'all' ? t('history.all') : t(`history.types.${f}`))} />
      {isLoading && !data && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && <MedicalEventList events={events} onSelect={open} grouped />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
});
