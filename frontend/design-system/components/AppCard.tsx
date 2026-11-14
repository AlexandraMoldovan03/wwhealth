import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { radius, shadows, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { enterUp, tapFeedback } from '@/design-system/motion';

export interface AppCardProps extends PropsWithChildren {
  /** When provided, the card becomes pressable. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Animate in on mount; the number staggers siblings (0, 1, 2…). */
  enterIndex?: number;
  /** 'flat' = no shadow (nested cards / dense lists). */
  tone?: 'default' | 'flat' | 'muted' | 'info';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppCard({
  children,
  onPress,
  style,
  padded = true,
  accessibilityLabel,
  accessibilityHint,
  enterIndex,
  tone = 'default',
}: AppCardProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const entering = enterIndex === undefined ? undefined : enterUp(enterIndex);

  const cardStyle = [
    styles.card,
    {
      backgroundColor: tone === 'muted' ? colors.surfaceAlt : tone === 'info' ? colors.accentMuted : colors.surface,
      borderColor: tone === 'muted' ? 'transparent' : colors.border,
    },
    !isDark && tone === 'default' && shadows.card,
    padded && styles.padded,
  ];

  if (!onPress) {
    return (
      <Animated.View entering={entering} style={[cardStyle, style]}>
        {children}
      </Animated.View>
    );
  }

  // Layout animations and the animated press `transform` must live on different views
  // (Reanimated would overwrite one with the other), so the entrance runs on a wrapper.
  const { outer, inner } = splitLayoutStyle(style);
  const pressable = (
    <AnimatedPressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={() => {
        if (!reduceMotion) scale.set(withTiming(0.98, { duration: 90 }));
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.set(withTiming(1, { duration: 110 }));
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[cardStyle, entering ? inner : style, entering && outer ? styles.fill : null, pressStyle]}
    >
      {children}
    </AnimatedPressable>
  );

  if (!entering) return pressable;
  return (
    <Animated.View entering={entering} style={outer}>
      {pressable}
    </Animated.View>
  );
}

const LAYOUT_KEYS = [
  'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'width', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
] as const;

/** Separates the outer layout props (flex sizing, margins) from the card's own visual style. */
function splitLayoutStyle(style: StyleProp<ViewStyle>) {
  const flat = { ...(StyleSheet.flatten(style) ?? {}) } as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  for (const key of LAYOUT_KEYS) {
    if (key in flat) {
      outer[key] = flat[key];
      delete flat[key];
    }
  }
  return {
    outer: Object.keys(outer).length ? (outer as ViewStyle) : undefined,
    inner: flat as ViewStyle,
  };
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  padded: { padding: spacing.md + 2 },
  fill: { flexGrow: 1 },
});
