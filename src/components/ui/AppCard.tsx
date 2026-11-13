import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface AppCardProps extends PropsWithChildren {
  /** When provided, the card becomes pressable. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
  /** 'hero' = dark teal filled card with a stronger shadow (e.g. Medical Passport). */
  tone?: 'default' | 'hero';
}

export function AppCard({ children, onPress, style, padded = true, accessibilityLabel, tone = 'default' }: AppCardProps) {
  const { colors, isDark } = useTheme();
  const isHero = tone === 'hero';
  const cardStyle = [
    styles.card,
    isHero
      ? { backgroundColor: colors.hero, borderColor: colors.hero, borderRadius: radius.xl, ...shadows.hero }
      : { backgroundColor: colors.surface, borderColor: colors.border },
    !isHero && !isDark && shadows.card,
    padded && styles.padded,
  ];

  if (!onPress) return <View style={[cardStyle, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1 },
  padded: { padding: spacing.md },
});
