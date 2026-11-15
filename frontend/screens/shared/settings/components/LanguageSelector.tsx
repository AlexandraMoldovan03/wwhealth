import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { LANGUAGES, setLanguagePreference } from '@/i18n';

/** English and Romanian language choices. */
export function LanguageSelector() {
  const { colors } = useTheme();
  const { i18n } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      {LANGUAGES.map((option) => {
        const active = option.code === i18n.language;
        return (
          <Pressable
            key={option.code}
            onPress={() => void setLanguagePreference(option.code)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.option, active && { backgroundColor: colors.surface }]}
          >
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
  label: { fontFamily: 'DMSans_700Bold' },
});
