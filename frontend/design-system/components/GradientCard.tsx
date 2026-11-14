import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { radius, shadows, spacing } from '@/design-system/theme';

import { enterUp } from '@/design-system/motion';

interface GradientCardProps extends PropsWithChildren {
  colors: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
  enterIndex?: number;
}

/** Hero surface with a soft diagonal gradient and two discreet decorative circles. */
export function GradientCard({ colors, style, enterIndex, children }: GradientCardProps) {
  return (
    <Animated.View entering={enterIndex === undefined ? undefined : enterUp(enterIndex)} style={[styles.shadow, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View pointerEvents="none" style={[styles.circle, styles.circleA]} />
        <View pointerEvents="none" style={[styles.circle, styles.circleB]} />
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.xl, ...shadows.raised },
  card: { borderRadius: radius.xl, padding: spacing.lg, overflow: 'hidden', gap: spacing.md },
  circle: { position: 'absolute', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' },
  circleA: { width: 220, height: 220, top: -90, right: -70 },
  circleB: { width: 140, height: 140, bottom: -70, right: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
});
