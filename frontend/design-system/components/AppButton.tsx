import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { iconSize, radius, sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';
import { tapFeedback } from '@/design-system/motion';

/** inverse = for use on top of a dark / coloured background. */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';

export interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: Variant;
  size?: 'md' | 'sm' | 'lg';
  icon?: IconName;
  /** Icon at the end (e.g. arrow-forward). */
  trailingIcon?: IconName;
  /** Optional icon/text colour override for buttons on custom backgrounds. */
  contentColor?: string;
  loading?: boolean;
  fullWidth?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  contentColor,
  loading = false,
  fullWidth = false,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: AppButtonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    secondary: { bg: colors.primaryMuted, fg: colors.primary, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    inverse: { bg: 'rgba(255,255,255,0.95)', fg: '#1C2E34', border: 'transparent' },
  };
  const { bg, fg: variantFg, border } = palette[variant];
  const fg = contentColor ?? variantFg;
  const height = size === 'sm' ? sizes.buttonHeightSmall : size === 'lg' ? sizes.buttonHeight + 8 : sizes.buttonHeight;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={(e) => {
        if (!reduceMotion) scale.set(withTiming(0.97, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) scale.set(withTiming(1, { duration: 110 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        tapFeedback();
        onPress?.(e);
      }}
      style={[
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          height,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          opacity: isDisabled ? 0.45 : 1,
        },
        fullWidth && styles.fullWidth,
        animatedStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? iconSize.sm : iconSize.md} color={fg} />}
          <AppText variant="subheading" style={[{ color: fg }, size === 'sm' && styles.smallText]} numberOfLines={1}>
            {title}
          </AppText>
          {trailingIcon && <Ionicons name={trailingIcon} size={iconSize.md} color={fg} />}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  smallText: { fontSize: 14 },
});
