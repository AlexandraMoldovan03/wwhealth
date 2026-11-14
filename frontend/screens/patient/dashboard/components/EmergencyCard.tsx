import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, GradientCard } from '@/design-system';
import { gradients, spacing } from '@/design-system/theme';
import { useTranslation } from 'react-i18next';

/** Emergency Passport shortcut — kept one tap away on Home and in Transfer & Access. */
export function EmergencyCard({ enterIndex }: { enterIndex?: number }) {
  const { t } = useTranslation();
  return (
    <GradientCard colors={gradients.emergency} enterIndex={enterIndex}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="medkit" size={24} color="#B9505F" />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" style={styles.ink}>
            {t('home.emergency.title')}
          </AppText>
          <AppText variant="caption" style={styles.inkSoft}>
            {t('home.emergency.text')}
          </AppText>
        </View>
      </View>
      <AppButton title={t('home.emergencyQr')} icon="qr-code-outline" variant="danger" fullWidth onPress={() => router.push('/patient/emergency')} />
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: spacing.xxs },
  // The coral card is light in both themes → fixed dark text keeps AA contrast.
  ink: { color: '#1C2E34' },
  inkSoft: { color: '#3E4F55' },
});
