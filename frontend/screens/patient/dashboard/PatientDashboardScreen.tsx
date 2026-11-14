import { RefreshControl, StyleSheet, View } from 'react-native';

import { ErrorState, ScreenContainer, SectionHeader } from '@/design-system';
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
 * real record progress (hideable) and what each section is for.
 * Every number comes from the patient's real record.
 */
export function PatientDashboardScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: patient, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const progress = useRecordProgress(patient);
  const name = patient?.fullName || user?.fullName || t('home.there');

  return (
    <ScreenContainer help="home" refreshControl={<RefreshControl refreshing={isLoading && !!patient} onRefresh={reload} tintColor={colors.primary} />}>
      <WelcomeHeader name={name} roleLabel={t('roles.patient')} headline={t('home.headline')} />

      <PassportButton />

      <EmergencyCard enterIndex={1} />

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
        <SectionHeader title={t('journey.title')} subtitle={t('journey.subtitle')} />
        <JourneyCards startIndex={6} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.md } });
