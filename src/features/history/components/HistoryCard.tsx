import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, IconBadge } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { HistoryItem } from '@/types';
import { formatDateTime } from '@/utils/format';

import { getStatusStyle } from '../statusStyle';

export function HistoryCard({ item, onPress }: { item: HistoryItem; onPress: () => void }) {
  const { colors } = useTheme();
  const status = getStatusStyle(item.status, colors);
  return (
    <AppCard onPress={onPress} accessibilityLabel={item.title}>
      <View style={styles.row}>
        <IconBadge icon={item.icon} />
        <View style={styles.text}>
          <AppText variant="subheading" numberOfLines={1}>
            {item.title}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {formatDateTime(item.date)}
          </AppText>
        </View>
        <Badge label={status.label} color={status.color} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
});
