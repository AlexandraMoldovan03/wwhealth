import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ErrorState, ScreenContainer, SectionHeader, StatTile } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { EmergencyCard } from './components/EmergencyCard';
import { JourneyCards } from './components/JourneyCards';
import { NextStepCard } from './components/NextStepCard';
import { PassportButton } from './components/PassportButton';
import { ProgressChecklist } from './components/ProgressChecklist';
import { useRecordProgress } from './useRecordProgress';
import { WelcomeHeader } from '@/screens/shared/components/WelcomeHeader';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/**
 * Patient Home — action-oriented: welcome, Emergency Passport one tap away, the recommended next step,
 * real record progress (hideable), snapshot, what each section is for.
 * Every number comes from the patient's real record.
 */
export function PatientDashboardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: patient, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const progress = useRecordProgress(patient);
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
    <ScreenContainer help="home" refreshControl={<RefreshControl refreshing={isLoading && !!patient} onRefresh={reload} tintColor={colors.primary} />}>
      <WelcomeHeader name={name} roleLabel={t('roles.patient')} headline={t('home.headline')} />

      <EmergencyCard enterIndex={1} />

      <PassportButton />

      {error && !patient ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        progress.ready && (
          <>
            <NextStepCard next={progress.next} enterIndex={2} />
            {!progress.hidden && (
              <ProgressChecklist steps={progress.steps} doneCount={progress.doneCount} onHide={() => progress.hide(true)} enterIndex={3} />
            )}
          </>
        )
      )}

      <View style={styles.section}>
        <SectionHeader title={t('home.snapshot')} actionLabel={t('home.edit')} onActionPress={() => router.push('/patient/edit-profile')} />
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <StatTile key={s.label} {...s} enterIndex={4 + i} onPress={() => router.push('/patient/profile')} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('journey.title')} subtitle={t('journey.subtitle')} />
        <JourneyCards startIndex={6} />
      </View>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
});
