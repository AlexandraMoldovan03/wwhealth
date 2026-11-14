import { View } from 'react-native';

import { Badge, EmptyState, ListRow } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { XrayAnalysis } from '@/types';
import { formatDateTime, formatPercent } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** List of LungVision analyses. Used by patient and doctor screens. */
export function XrayList({ xrays, onSelect }: { xrays: XrayAnalysis[]; onSelect?: (x: XrayAnalysis) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (xrays.length === 0) return <EmptyState icon="scan-outline" title={t('xray.noAnalyses')} />;
  return (
    <View style={{ gap: spacing.md }}>
      {xrays.map((x) => (
        <ListRow
          key={x.id}
          icon="scan-outline"
          title={`${x.topLabel} · ${formatPercent(x.predictions[0]?.probability ?? 0)}`}
          subtitle={formatDateTime(x.createdAt)}
          right={x.isDemo ? <Badge label="DEMO" color={colors.warning} /> : undefined}
          onPress={onSelect ? () => onSelect(x) : undefined}
        />
      ))}
    </View>
  );
}
