import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText, enterUp } from '@/components/ui';
import { APP_INFO } from '@/constants/config';
import { gradients, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** Brand row + large calm title, with a soft sage→blue "sun" behind it. */
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
      <View style={styles.brand}>
        <LinearGradient colors={gradients.patientHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
          <Ionicons name="leaf" size={22} color="#FFFFFF" />
        </LinearGradient>
        <View>
          <AppText variant="subheading">{APP_INFO.name}</AppText>
          <AppText variant="caption" color="textMuted">
            {APP_INFO.fullName}
          </AppText>
        </View>
      </View>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 48, height: 48, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  text: { gap: spacing.sm },
  title: { fontSize: 34, lineHeight: 40 },
});
