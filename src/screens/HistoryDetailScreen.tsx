import { Stack } from 'expo-router';
import { type PropsWithChildren, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, ErrorState, IconBadge, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { getStatusStyle } from '@/features/history/statusStyle';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { getHistoryItem } from '@/services/historyService';
import { formatDateTime } from '@/utils/format';

export function HistoryDetailScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const load = useCallback(() => getHistoryItem(id), [id]);
  const { data: item, isLoading, error, reload } = useAsync(load);

  if (isLoading) return <Wrapper><LoadingState /></Wrapper>;
  if (error || !item) return <Wrapper><ErrorState message={error ?? 'Not found'} onRetry={reload} /></Wrapper>;

  const status = getStatusStyle(item.status, colors);

  return (
    <Wrapper>
      <Stack.Screen options={{ title: item.title }} />
      <AppCard style={styles.hero}>
        <IconBadge icon={item.icon} size={56} />
        <View style={styles.heroText}>
          <AppText variant="title">{item.title}</AppText>
          <AppText variant="caption" color="textMuted">
            {formatDateTime(item.date)}
          </AppText>
          <Badge label={status.label} color={status.color} />
        </View>
      </AppCard>

      <AppCard style={styles.section}>
        <AppText variant="label" color="textMuted">
          Description
        </AppText>
        <AppText>{item.description}</AppText>
      </AppCard>

      <AppCard style={styles.section}>
        <AppText variant="label" color="textMuted">
          Details
        </AppText>
        {Object.entries(item.details).map(([key, value]) => (
          <View key={key} style={[styles.detailRow, { borderTopColor: colors.border }]}>
            <AppText color="textMuted">{key}</AppText>
            <AppText variant="subheading" style={styles.detailValue}>
              {value}
            </AppText>
          </View>
        ))}
      </AppCard>
    </Wrapper>
  );
}

/** Detail screens sit under a header, so no top safe-area padding is needed. */
function Wrapper({ children }: PropsWithChildren) {
  return <ScreenContainer edges={['bottom']}>{children}</ScreenContainer>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailValue: { flexShrink: 1, textAlign: 'right' },
});
