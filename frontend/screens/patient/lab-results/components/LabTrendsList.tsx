import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, EmptyState } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { formatDate } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import type { LabSeries } from '@/screens/patient/lab-results/labUtils';
import { LabFlagBadge } from './LabFlagBadge';
import { LabTrendChart } from './LabTrendChart';

/** One card per analysis + unit: latest value, its flag vs. the printed range, and a sparkline. */
export function LabTrendsList({ series, onSelect }: { series: LabSeries[]; onSelect: (s: LabSeries) => void }) {
  const { t } = useTranslation();
  if (series.length === 0) {
    return <EmptyState icon="analytics-outline" title={t('labs.trendsEmpty')} message={t('labs.trendsEmptyHint')} />;
  }
  return (
    <View style={styles.list}>
      {series.map((s, i) => {
        const latest = s.points[s.points.length - 1];
        const numeric = s.points.filter((p) => p.numeric !== null).length;
        return (
          <AppCard
            key={s.id}
            enterIndex={i}
            onPress={() => onSelect(s)}
            accessibilityLabel={`${s.name}, ${latest.value} ${s.unit ?? ''}`}
            accessibilityHint={t('labs.openTrend')}
            style={styles.card}
          >
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="subheading" numberOfLines={1}>
                  {s.name}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {t('labs.measurements', { count: s.points.length })}
                  {latest.date ? ` · ${formatDate(latest.date)}` : ''}
                </AppText>
              </View>
              <View style={styles.value}>
                <AppText variant="heading">
                  {latest.value}
                  {s.unit ? <AppText variant="caption" color="textMuted">{` ${s.unit}`}</AppText> : null}
                </AppText>
                <LabFlagBadge value={latest.value} range={latest.referenceRange} />
              </View>
            </View>
            {numeric >= 2 && <LabTrendChart series={s} compact />}
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { alignItems: 'flex-end', gap: 2 },
  flex: { flex: 1 },
});
