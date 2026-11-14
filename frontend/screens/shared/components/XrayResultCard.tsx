import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, DemoNotice } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { XrayAnalysis } from '@/types';
import { formatDateTime, formatPercent } from '@/utils/format';

import { HeatmapPreview } from './HeatmapPreview';
import { useTranslation } from 'react-i18next';

/** Full LungVision result: heatmap, probabilities, model info, disclaimer. */
export function XrayResultCard({ result, showHeatmap = true }: { result: XrayAnalysis; showHeatmap?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="label" color="textMuted">
            {t('xray.topFinding')}
          </AppText>
          <AppText variant="title">{result.topLabel}</AppText>
        </View>
        {result.isDemo && <Badge label="DEMO" color={colors.warning} />}
      </View>

      {showHeatmap && <HeatmapPreview imageUrl={result.imageUrl} heatmapUrl={result.heatmapUrl} />}

      <View style={styles.labels}>
        {result.predictions.map((p) => (
          <View key={p.label} style={styles.labelRow}>
            <View style={styles.labelText}>
              <AppText variant="subheading">{p.label}</AppText>
              <AppText variant="caption" color="textMuted">
                {formatPercent(p.probability)}
              </AppText>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.fill, { width: `${p.probability * 100}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>
        ))}
      </View>

      <AppText variant="caption" color="textSubtle">
        {result.modelVersion} · {result.processingTimeMs} ms · {formatDateTime(result.createdAt)}
      </AppText>
      <DemoNotice message={result.disclaimer} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { gap: spacing.xxs },
  labels: { gap: spacing.md },
  labelRow: { gap: spacing.xs },
  labelText: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
