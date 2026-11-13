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
}

export function AppCard({ children, onPress, style, padded = true, accessibilityLabel }: AppCardProps) {
  const { colors, isDark } = useTheme();
  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border },
    !isDark && shadows.card,
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
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  padded: { padding: spacing.md },
});
