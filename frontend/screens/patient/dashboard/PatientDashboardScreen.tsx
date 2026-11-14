import { RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText, ErrorState, ScreenContainer } from '@/design-system';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { CareJourneyCard } from '@/screens/patient/care-journey/CareJourneyCard';
import { JourneyCards } from './components/JourneyCards';
import { NextStepCard } from './components/NextStepCard';
import { PassportButton } from './components/PassportButton';
import { EmergencyCard } from './components/EmergencyCard';
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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: patient, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const progress = useRecordProgress(patient);
  const fullName = patient?.fullName?.trim() || user?.fullName?.trim() || '';
  const name = fullName || t('home.there');

  return (
    <ScreenContainer help="home" refreshControl={<RefreshControl refreshing={isLoading && !!patient} onRefresh={reload} tintColor={colors.primary} />}>
      <WelcomeHeader name={name} roleLabel={t('roles.patient')} />

      <View style={styles.headline}>
        <View pointerEvents="none" style={styles.aura}>
          <Svg width="100%" height="100%" viewBox="0 0 360 120" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="headline-aura" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor={isDark ? '#50B99D' : '#7FCDB6'} stopOpacity={isDark ? 0.24 : 0.5} />
                <Stop offset="60%" stopColor="#73B9C2" stopOpacity={isDark ? 0.1 : 0.2} />
                <Stop offset="100%" stopColor="#73B9C2" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={360} height={120} fill="url(#headline-aura)" />
          </Svg>
        </View>
        <AppText variant="heading" accessibilityRole="header" style={styles.headlineText}>
          {t('home.headline')}
        </AppText>
      </View>

      <PassportButton fullName={fullName} patient={patient} />
      <EmergencyCard enterIndex={1} />

      <CareJourneyCard enterIndex={2} />

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

      {user && <JourneyCards key={user.id} userId={user.id} startIndex={6} />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headline: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 52, maxWidth: '100%' },
  aura: { position: 'absolute', left: -26, right: -26, top: -18, bottom: -18 },
  headlineText: { fontSize: 19, lineHeight: 26 },
});
