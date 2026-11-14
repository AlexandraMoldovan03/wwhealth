import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { iconSize, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getLanguagePreference, LANGUAGES, setLanguagePreference, type LanguagePreference } from '@/i18n';

/** Segmented control: System / English / Română. The choice is saved on the device. */
export function LanguageSelector() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [preference, setPreference] = useState<LanguagePreference>('system');

  useEffect(() => {
    getLanguagePreference().then(setPreference);
  }, []);

  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    ...LANGUAGES.map((l) => ({ value: l.code, label: l.label })), // language names stay in their own language
  ];

  const select = (value: LanguagePreference) => {
    setPreference(value);
    setLanguagePreference(value);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const active = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => select(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.option, active && { backgroundColor: colors.surface }]}
          >
            {option.value === 'system' && (
              <Ionicons name="phone-portrait-outline" size={iconSize.sm} color={active ? colors.primary : colors.textMuted} />
            )}
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
