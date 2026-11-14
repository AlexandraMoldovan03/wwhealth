import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppText, ErrorState, GradientCard, LoadingState, ScreenContainer, SectionHeader, StatTile } from '@/components/ui';
import { gradients, spacing } from '@/constants/theme';
import { QUICK_ACTIONS } from '@/data/quickActions';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { MedicalEventList } from '@/features/history/components/MedicalEventList';
import { HeroCard } from '@/features/home/components/HeroCard';
import { QuickActionGrid } from '@/features/home/components/QuickActionGrid';
import { WelcomeHeader } from '@/features/home/components/WelcomeHeader';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** Patient Dashboard — Home tab for accounts with role `patient` in Supabase. All numbers come from the real record. */
export function PatientDashboardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: patient, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const name = patient?.fullName || user?.fullName || t('home.there');


  const loading = !patient && isLoading;
  const stats = [
    { icon: 'water-outline' as const, label: t('home.stats.bloodType'), value: loading ? undefined : patient?.bloodType ?? '—', tint: colors.danger },
    { icon: 'alert-circle-outline' as const, label: t('home.stats.allergies'), value: loading ? undefined : patient?.allergies.length ?? 0, tint: colors.warning },
    {
      icon: 'pulse-outline' as const,
      label: t('home.stats.activeDiagnoses'),
      value: loading ? undefined : patient?.diagnoses.filter((d) => d.status === 'active').length ?? 0,
      tint: colors.accent,
    },
  ];

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isLoading && !!patient} onRefresh={reload} tintColor={colors.primary} />}>
      <WelcomeHeader name={name} roleLabel={t('roles.patient')} headline={t('home.headline')} />

      <GradientCard colors={gradients.emergency} enterIndex={1}>
        <View style={styles.emergencyRow}>
          <View style={styles.emergencyIcon}>
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
        <AppButton
          title={t('home.emergencyQr')}
          icon="qr-code-outline"
          variant="danger"
          fullWidth
          onPress={() => router.push('/patient/emergency')}
        />
      </GradientCard>

      <View style={styles.section}>
        <SectionHeader title={t('home.snapshot')} actionLabel={t('home.edit')} onActionPress={() => router.push('/patient/edit-profile')} />
        {error && !patient ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <View style={styles.stats}>
            {stats.map((s, i) => (
              <StatTile key={s.label} {...s} enterIndex={2 + i} onPress={() => router.push('/patient/profile')} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('home.quickActions')} />
        <QuickActionGrid actions={QUICK_ACTIONS} startIndex={4} />
      </View>

      <HeroCard enterIndex={6} />

      <View style={styles.section}>
        <SectionHeader title={t('home.recentActivity')} actionLabel={t('home.seeAll')} onActionPress={() => router.navigate('/history')} />
        {loading ? (
          <LoadingState count={2} />
        ) : (
          <MedicalEventList
            events={(patient?.history ?? []).slice(0, 3)}
            onSelect={(e) => router.push({ pathname: '/history/[id]', params: { id: e.id } })}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  emergencyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emergencyIcon: {
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
