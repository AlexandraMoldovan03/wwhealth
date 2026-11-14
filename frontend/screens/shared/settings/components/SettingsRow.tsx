import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, IconBadge } from '@/design-system';
import { iconSize, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';

interface SettingsRowProps {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  /** Custom element on the right (e.g. a Switch). */
  right?: ReactNode;
}

export function SettingsRow({ icon, title, value, onPress, right }: SettingsRowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      <IconBadge icon={icon} size={36} />
      <AppText variant="subheading" style={styles.title}>
        {title}
      </AppText>
      {value && (
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      )}
      {right}
      {onPress && !right && <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textSubtle} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  title: { flex: 1 },
  value: { maxWidth: '45%' },
});
