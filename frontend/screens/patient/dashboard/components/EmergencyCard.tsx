import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/design-system';
import { gradients, radius, spacing } from '@/design-system/theme';

export function EmergencyCard({ enterIndex }: { enterIndex?: number }) {
  const { t } = useTranslation();
  const title = t('home.emergencyQr');
  const hint = t('home.emergencyQrHint');

  return (
    <AppCard
      onPress={() => router.push('/patient/emergency')}
      enterIndex={enterIndex}
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={styles.button}
      padded={false}
      tone="flat"
    >
      <LinearGradient
        colors={['#C36A7B', '#E29BA7', '#F2C6CD']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frame}
      >
        <LinearGradient colors={gradients.emergency} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.row}>
          <View style={styles.badge}>
            <Ionicons name="qr-code-outline" size={23} color="#9D344A" />
          </View>
          <View style={styles.copy}>
            <AppText variant="subheading" style={styles.title}>{title}</AppText>
            <AppText variant="caption" style={styles.hint}>{hint}</AppText>
          </View>
          <Ionicons name="chevron-forward" size={19} color="#9D344A" />
        </LinearGradient>
      </LinearGradient>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    borderWidth: 0,
    borderRadius: radius.lg,
    shadowColor: '#C36A7B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  frame: { borderRadius: radius.lg, padding: 1.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    borderRadius: radius.lg - 1.5,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#36232B' },
  hint: { color: '#664650' },
});
