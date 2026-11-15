import { View } from 'react-native';

import { Badge, EmptyState, ListRow } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { XrayAnalysis } from '@/types';
import { formatDateTime, formatPercent } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** List of LungVision analyses. Used by patient and doctor screens. */
export function XrayList({
  xrays,
  onSelect,
  emptyAction,
}: {
  xrays: XrayAnalysis[];
  onSelect?: (x: XrayAnalysis) => void;
  emptyAction?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (xrays.length === 0) {
    return (
      <EmptyState
        icon="scan-outline"
        title={t('xray.noAnalyses')}
        message={t('xray.noAnalysesHint')}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onPress}
      />
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      {xrays.map((x) => (
        <ListRow
          key={x.id}
          icon="scan-outline"
          title={`${x.topLabel} · ${formatPercent(x.predictions[0]?.probability ?? 0)}`}
          subtitle={formatDateTime(x.createdAt)}
          right={x.isDemo ? <Badge label={t('home.demoData')} color={colors.warning} /> : undefined}
          onPress={onSelect ? () => onSelect(x) : undefined}
        />
      ))}
    </View>
  );
}
