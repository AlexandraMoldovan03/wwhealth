import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design-system';
import { iconSize, radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName, ThemePreference } from '@/types';
import { useTranslation } from 'react-i18next';

const OPTIONS: { value: ThemePreference; labelKey: 'settings.themeLight' | 'settings.themeDark' | 'settings.themeSystem'; icon: IconName }[] = [
  { value: 'light', labelKey: 'settings.themeLight', icon: 'sunny-outline' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'moon-outline' },
  { value: 'system', labelKey: 'settings.themeSystem', icon: 'phone-portrait-outline' },
];

/** Segmented control for Light / Dark / System. */
export function ThemeSelector() {
  const { colors, preference, setPreference } = useTheme();
  const { t } = useTranslation();
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
              {t(option.labelKey)}
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
  label: { fontFamily: 'DMSans_700Bold' },
});
