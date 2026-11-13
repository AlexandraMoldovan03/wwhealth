import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** Dark teal call-to-action card at the top of Home: opens the QR Medical Passport. */
export function HeroCard() {
  const { colors } = useTheme();
  return (
    <AppCard
      tone="hero"
      onPress={() => router.push('/patient/passport')}
      accessibilityLabel="Open Medical Passport"
      style={styles.card}
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="label" color="onHero" style={styles.eyebrow}>
            Your health, in one place
          </AppText>
          <AppText variant="title" color="onHero">
            Medical Passport
          </AppText>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.heroPill }]}>
          <AppText variant="label" style={{ color: colors.primary }}>
            Open
          </AppText>
        </View>
      </View>
      <AppText variant="caption" color="onHero" style={styles.subtitle}>
        Share your record securely with a doctor.
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  eyebrow: { opacity: 0.9 },
  subtitle: { opacity: 0.85 },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill },
});
