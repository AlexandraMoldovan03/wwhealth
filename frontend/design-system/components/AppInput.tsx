import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { iconSize, radius, sizes, spacing, typography } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';
import { useTranslation } from 'react-i18next';

export interface AppInputProps extends TextInputProps {
  label?: string;
  icon?: IconName;
  error?: string;
  /** Shows an "x" button that calls this when pressed. */
  onClear?: () => void;
}

export function AppInput({ label, icon, error, onClear, value, style, onFocus, onBlur, ...rest }: AppInputProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      {label && (
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      )}
      <View
        style={[
          styles.field,
          rest.multiline && styles.fieldMultiline,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      >
        {icon && <Ionicons name={icon} size={iconSize.md} color={focused ? colors.primary : colors.textMuted} />}
        <TextInput
          value={value}
          placeholderTextColor={colors.textSubtle}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, rest.multiline && styles.inputMultiline, { color: colors.text }, style]}
          {...rest}
        />
        {onClear && !!value && (
          <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={t('common.clear')}>
            <Ionicons name="close-circle" size={iconSize.md} color={colors.textSubtle} />
          </Pressable>
        )}
      </View>
      {error && (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    height: sizes.inputHeight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Multiline (e.g. symptom description): grows with the text, same look.
  fieldMultiline: { height: undefined, minHeight: sizes.inputHeight, alignItems: 'flex-start', paddingVertical: spacing.sm },
  inputMultiline: { height: undefined, textAlignVertical: 'top' },
  input: { flex: 1, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, height: '100%' },
});
