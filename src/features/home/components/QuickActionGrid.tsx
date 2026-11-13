import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, IconBadge } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { QuickAction } from '@/data/quickActions';

export function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.grid}>
      {actions.map((action) => (
        <AppCard
          key={action.id}
          style={styles.item}
          onPress={() => router.navigate(action.route)}
          accessibilityLabel={action.title}
        >
          <IconBadge icon={action.icon} />
          <View style={styles.text}>
            <AppText variant="subheading">{action.title}</AppText>
            <AppText variant="caption" color="textMuted">
              {action.subtitle}
            </AppText>
          </View>
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Two columns: each card takes ~half the row minus the gap.
  item: { flexBasis: '46%', flexGrow: 1, gap: spacing.md },
  text: { gap: spacing.xxs },
});
