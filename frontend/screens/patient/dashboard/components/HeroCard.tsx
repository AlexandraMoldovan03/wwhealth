import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, GradientCard } from '@/design-system';
import { gradients, spacing } from '@/design-system/theme';
import { useTranslation } from 'react-i18next';

/** LungVision call-to-action on the patient dashboard. */
export function HeroCard({ enterIndex }: { enterIndex?: number }) {
  const { t } = useTranslation();
  return (
    <GradientCard colors={gradients.patientHero} enterIndex={enterIndex}>
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="label" style={styles.kicker}>
            {t('home.hero.kicker')}
          </AppText>
          <AppText variant="heading" style={styles.white}>
            LungVision AI
          </AppText>
          <AppText variant="body" style={styles.description}>
            {t('explain.lungvision.text')}
          </AppText>
        </View>
        <Ionicons name="sparkles" size={30} color="#FFFFFF" />
      </View>
      <View style={styles.buttonWrap}>
        <AppButton
          title={t('home.hero.button')}
          trailingIcon="arrow-forward"
          variant="inverse"
          size="sm"
          onPress={() => router.navigate('/analysis')}
        />
      </View>
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  kicker: { color: 'rgba(255,255,255,0.85)' },
  white: { color: '#FFFFFF' },
  description: { color: '#142b32' },
  buttonWrap: { alignSelf: 'flex-start' },
});
