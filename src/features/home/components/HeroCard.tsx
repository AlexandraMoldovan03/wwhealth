import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** Highlighted call-to-action card at the top of Home. */
export function HeroCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.primary }]}>
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="heading" color="onPrimary">
            Try AI Image Analysis
          </AppText>
          <AppText variant="caption" color="onPrimary" style={styles.subtitle}>
            Pick a photo and see a simulated result. Swap in your FastAPI model later.
          </AppText>
        </View>
        <Ionicons name="sparkles" size={36} color={colors.onPrimary} />
      </View>
      <View style={styles.buttonWrap}>
        <AppButton
          title="Start analysis"
          icon="arrow-forward"
          variant="inverse"
          size="sm"
          onPress={() => router.navigate('/analysis')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  subtitle: { opacity: 0.9 },
  buttonWrap: { alignSelf: 'flex-start' },
});
