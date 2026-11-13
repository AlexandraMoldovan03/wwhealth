import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { AnalysisResult } from '@/types';
import { formatPercent } from '@/utils/format';

export function AnalysisResultCard({ result }: { result: AnalysisResult }) {
  const { colors } = useTheme();
  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <AppText variant="heading">Results</AppText>
        {result.isDemo && <Badge label="DEMO · simulated" color={colors.warning} />}
      </View>
      <AppText color="textMuted">{result.summary}</AppText>

      <View style={styles.labels}>
        {result.labels.map((item) => (
          <View key={item.label} style={styles.labelRow}>
            <View style={styles.labelText}>
              <AppText variant="subheading">{item.label}</AppText>
              <AppText variant="caption" color="textMuted">
                {formatPercent(item.confidence)}
              </AppText>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[styles.fill, { width: `${item.confidence * 100}%`, backgroundColor: colors.primary }]}
              />
            </View>
          </View>
        ))}
      </View>

      <AppText variant="caption" color="textSubtle">
        Model: {result.model} · {result.processingTimeMs} ms
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  labels: { gap: spacing.md },
  labelRow: { gap: spacing.xs },
  labelText: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
