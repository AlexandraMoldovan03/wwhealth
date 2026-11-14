import { Stack, router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { LabFlagBadge } from '@/features/labs/components/LabFlagBadge';
import { LabTrendChart } from '@/features/labs/components/LabTrendChart';
import { buildLabSeries } from '@/features/labs/labUtils';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import { formatDate } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Evolution of one analysis (one unit) over time + every measurement with its original document. */
export function LabTrendScreen({ seriesId }: { seriesId: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.listLabValues, { refetchOnFocus: true });
  const series = useMemo(() => buildLabSeries(data ?? []).find((s) => s.id === seriesId), [data, seriesId]);

  if (isLoading && !data) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error && !data) return <ScreenContainer edges={['bottom']}><ErrorState message={error} onRetry={reload} /></ScreenContainer>;
  if (!series) {
    return (
      <ScreenContainer edges={['bottom']}>
        <EmptyState icon="analytics-outline" title={t('labs.trendMissing')} message={t('labs.trendsEmptyHint')} />
      </ScreenContainer>
    );
  }

  const numeric = series.points.filter((p) => p.numeric !== null).length;
  const newestFirst = [...series.points].reverse();
  return (
    <ScreenContainer edges={['bottom']}>
      <Stack.Screen options={{ title: series.name }} />
      <View style={styles.header}>
        <AppText variant="title">{series.name}</AppText>
        <AppText color="textMuted">
          {series.unit ? t('labs.unitLabel', { unit: series.unit }) : t('labs.noUnit')} · {t('labs.measurements', { count: series.points.length })}
        </AppText>
      </View>

      <AppCard enterIndex={0} style={styles.chartCard}>
        {numeric >= 1 ? (
          <LabTrendChart series={series} />
        ) : (
          <AppText color="textMuted">{t('labs.notNumeric')}</AppText>
        )}
        <AppText variant="caption" color="textMuted">
          {t('labs.chartNote')}
        </AppText>
      </AppCard>

      <AppText variant="heading">{t('labs.allMeasurements')}</AppText>
      <View style={styles.list}>
        {newestFirst.map((p, i) => (
          <ListRow
              key={`${p.documentId}-${i}`}
              enterIndex={i + 1}
              icon="document-text-outline"
              iconColor={colors.info}
              title={`${p.value}${series.unit ? ` ${series.unit}` : ''}`}
              subtitle={[p.date ? formatDate(p.date) : t('labs.noDate'), p.documentTitle].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/patient/document/[id]', params: { id: p.documentId } })}
              right={<LabFlagBadge value={p.value} range={p.referenceRange} />}
            />
        ))}
      </View>
      <AppText variant="caption" color="textSubtle">
        {t('labs.disclaimer')}
      </AppText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxs },
  chartCard: { gap: spacing.sm },
  list: { gap: spacing.sm },
});
