import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { iconSize, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName, ThemePreference } from '@/types';

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

/** Segmented control for Light / Dark / System. */
export function ThemeSelector() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      {OPTIONS.map((option) => {
        const active = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.option, active && { backgroundColor: colors.surface }]}
          >
            <Ionicons name={option.icon} size={iconSize.sm} color={active ? colors.primary : colors.textMuted} />
            <AppText variant="caption" color={active ? 'primary' : 'textMuted'} style={styles.label}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  label: { fontWeight: '600' },
});
