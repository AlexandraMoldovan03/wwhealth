import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, ErrorState, LoadingState, ScreenContainer, SectionHeader, StatTile } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { ProfileSections } from '@/screens/shared/components/ProfileSections';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/design-system/useTheme';

export function MedicalProfileScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const stats = data ? [
    { icon: 'water-outline' as const, label: t('home.stats.bloodType'), value: data.bloodType ?? '—', tint: colors.danger },
    { icon: 'alert-circle-outline' as const, label: t('home.stats.allergies'), value: data.allergies.length, tint: colors.warning },
    {
      icon: 'pulse-outline' as const,
      label: t('home.stats.activeDiagnoses'),
      value: data.diagnoses.filter((diagnosis) => diagnosis.status === 'active').length,
      tint: colors.accent,
    },
  ] : [];

  return (
    <ScreenContainer help="medicalProfile" edges={['bottom']}>
      {isLoading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <View style={styles.snapshot}>
            <SectionHeader title={t('home.snapshot')} />
            <View style={styles.stats}>
              {stats.map((stat) => <StatTile key={stat.label} {...stat} />)}
            </View>
          </View>
          <ProfileSections profile={data} />
          <AppButton title={t('profile.edit')} icon="create-outline" variant="secondary" fullWidth onPress={() => router.push('/patient/edit-profile')} />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  snapshot: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
});
