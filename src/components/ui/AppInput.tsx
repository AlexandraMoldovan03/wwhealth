import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { iconSize, radius, sizes, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';

export interface AppInputProps extends TextInputProps {
  label?: string;
  icon?: IconName;
  error?: string;
  /** Shows an "x" button that calls this when pressed. */
  onClear?: () => void;
}

export function AppInput({ label, icon, error, onClear, value, style, ...rest }: AppInputProps) {
  const { colors } = useTheme();
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
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
        ]}
      >
        {icon && <Ionicons name={icon} size={iconSize.md} color={colors.textMuted} />}
        <TextInput
          value={value}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, { color: colors.text }, style]}
          {...rest}
        />
        {onClear && !!value && (
          <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear">
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
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: typography.body.fontSize, height: '100%' },
});
