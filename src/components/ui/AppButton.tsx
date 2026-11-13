import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View } from 'react-native';

import { iconSize, radius, sizes, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';

/** inverse = for use on top of a primary-coloured background. */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';

export interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
}

export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: AppButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.primaryMuted, fg: colors.primary, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    inverse: { bg: colors.onPrimary, fg: colors.primary, border: colors.onPrimary },
  };
  const { bg, fg, border } = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          height: size === 'sm' ? sizes.buttonHeightSmall : sizes.buttonHeight,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        fullWidth && styles.fullWidth,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? iconSize.sm : iconSize.md} color={fg} />}
          <AppText variant="subheading" style={{ color: fg }}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
