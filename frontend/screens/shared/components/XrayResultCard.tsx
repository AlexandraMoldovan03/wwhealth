import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, DemoNotice } from '@/design-system';
import { DataOriginBadge } from './DataOrigin';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { XrayAnalysis } from '@/types';
import { formatDateTime } from '@/utils/format';

import { HeatmapPreview } from './HeatmapPreview';
import { PredictionCards } from './PredictionCards';
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
        <View style={styles.badges}>
          <DataOriginBadge origin="ai" />
          {result.isDemo && <Badge label={t('home.demoData')} color={colors.warning} />}
        </View>
      </View>

      {showHeatmap && <HeatmapPreview imageUrl={result.imageUrl} heatmapUrl={result.heatmapUrl} />}

      <PredictionCards predictions={result.predictions} />

      <AppText variant="caption" color="textSubtle">
        {result.modelVersion} · {result.processingTimeMs} ms · {formatDateTime(result.createdAt)}
      </AppText>
      <DemoNotice message={t('xray.disclaimer')} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  badges: { alignItems: 'flex-end', gap: 4 },
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { gap: spacing.xxs },
});
