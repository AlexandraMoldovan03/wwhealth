import { StyleSheet, View } from 'react-native';

import { AppText, IconBadge } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { ActivityItem } from '@/types';
import { formatRelativeTime } from '@/utils/format';

export function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.row}>
      <IconBadge icon={item.icon} size={40} />
      <View style={styles.text}>
        <AppText variant="subheading">{item.title}</AppText>
        <AppText variant="caption" numberOfLines={1}>
          {item.subtitle}
        </AppText>
      </View>
      <AppText variant="caption" color="primary" style={styles.when}>
        {formatRelativeTime(item.date)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, gap: spacing.xxs },
  when: { fontWeight: '700' },
});
