import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText, enterUp } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

/** Large calm title, with a soft sage→blue "sun" behind it. The brand logo comes from the screen background. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors, isDark } = useTheme();
  return (
    <Animated.View entering={enterUp()} style={styles.wrap}>
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(94,139,126,0.35)', 'rgba(167,199,231,0.12)'] : ['rgba(94,139,126,0.28)', 'rgba(167,199,231,0.35)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sun}
      />
      <View style={styles.text}>
        <AppText variant="display" style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {title}
        </AppText>
        <AppText color="textMuted">{subtitle}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sun: { position: 'absolute', width: 260, height: 260, borderRadius: radius.pill, top: -60, right: -90 },
  text: { gap: spacing.sm },
  title: { fontSize: 34, lineHeight: 40 },
});
