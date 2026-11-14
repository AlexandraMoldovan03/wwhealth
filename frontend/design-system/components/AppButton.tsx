import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { iconSize, sizes, spacing } from '@/design-system/theme';
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
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    secondary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    outline: { bg: colors.accent, fg: isDark ? '#121E22' : '#FFFFFF', border: colors.accent },
    ghost: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    inverse: { bg: 'rgba(255,255,255,0.95)', fg: '#1C2E34', border: 'transparent' },
  };
  const selected = palette[variant];
  const bg = contentColor ? '#DCEBFA' : selected.bg;
  const border = contentColor ? bg : selected.border;
  const fg = contentColor ?? selected.fg;
  const badgeIconColor = variant === 'danger' ? colors.danger : variant === 'inverse' ? colors.ink : colors.primary;
  const height = size === 'sm' ? sizes.buttonHeightSmall : size === 'lg' ? sizes.buttonHeight + 8 : sizes.buttonHeight;
  const badgeSize = Math.max(28, height - 14);

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
        <ActivityIndicator color={fg} style={styles.foreground} />
      ) : (
          <View style={[styles.foreground, styles.content, fullWidth && styles.contentFullWidth]}>
          <View style={[styles.iconBadge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
            <Ionicons name={icon ?? 'ellipse-outline'} size={size === 'sm' ? iconSize.sm : iconSize.md} color={badgeIconColor} />
          </View>
          <AppText variant="subheading" style={[styles.buttonText, { color: fg }, size === 'sm' && styles.smallText]} numberOfLines={1}>
            {title}
          </AppText>
          <Ionicons name={trailingIcon ?? 'chevron-forward-outline'} size={iconSize.md} color={fg} />
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
    borderTopLeftRadius: 38,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 38,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0 7px 16px rgba(14, 31, 40, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 4 },
  contentFullWidth: { width: '100%' },
  foreground: { position: 'relative', zIndex: 1 },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
    boxShadow: '0 4px 11px rgba(0, 0, 0, 0.38)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: { flex: 1, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 13 },
  smallText: { fontSize: 11, letterSpacing: 1 },
});
