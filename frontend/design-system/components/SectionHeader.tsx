import { Pressable, StyleSheet, View } from 'react-native';

import { spacing } from '@/design-system/theme';

import { AppText } from './AppText';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="heading">{title}</AppText>
        {subtitle && (
          <AppText variant="caption" color="textMuted">
            {subtitle}
          </AppText>
        )}
      </View>
      {actionLabel && onActionPress && (
        <Pressable onPress={onActionPress} hitSlop={8} accessibilityRole="button">
          <AppText variant="caption" color="primary" style={styles.action}>
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
  action: { fontFamily: 'DMSans_700Bold' },
});
