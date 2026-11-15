import { useRouter } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { EmergencyGuardiansSection, ProtectingSection, SyncNotice } from '@/screens/patient/emergency-guardians';
import { api } from '@/services/backend';

const loadOverview = () => api.getEmergencyGuardians();

/**
 * Family tab (patient) — emergency contacts stored in Supabase, so both phones see the same links:
 * • invitations I received (accept / decline) and the people I protect (open passport, generate THEIR QR);
 * • my own QR;
 * • the people I invited (pending / active / declined) and revoking access.
 * Links are one-directional: inviting someone never gives me access to their data.
 */
export function FamilyQRScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const overview = useAsync(loadOverview, { refetchOnFocus: true });

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={overview.isLoading && !!overview.data} onRefresh={() => void overview.reload()} />}
    >
      <View style={styles.heading}>
        <AppText variant="title" accessibilityRole="header">{t('guardians.familyTitle')}</AppText>
        <AppText color="textMuted">{t('guardians.familyIntro')}</AppText>
      </View>

      <SyncNotice />

      <ProtectingSection overview={overview} showEmpty />

      <View style={styles.section}>
        <SectionHeader title={t('guardians.myQrTitle')} />
        <AppCard style={styles.section}>
          <AppText color="textMuted">{t('guardians.myQrIntro')}</AppText>
          <AppText variant="caption" color="textMuted">{t('guardians.qrReplaces')}</AppText>
          <AppButton
            title={t('guardians.myQrOpen')}
            icon="qr-code-outline"
            variant="danger"
            fullWidth
            onPress={() => router.push('/patient/emergency')}
          />
        </AppCard>
      </View>

      <EmergencyGuardiansSection overview={overview} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  section: { gap: spacing.sm },
});
