import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, Badge, DemoNotice, ErrorState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { NoAccessState } from './components/NoAccessState';
import { useDoctorPatient } from './useDoctorPatient';
import { MedicalEventList } from '@/screens/shared/components/MedicalEventList';
import { ProfileSections } from '@/screens/shared/components/ProfileSections';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Patient Summary (doctor view) + medical summary, optionally read aloud (ElevenLabs). */
export function PatientSummaryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { session, patient } = useDoctorPatient();
  const voice = useSubmit(api.voiceSummary);

  if (!session || !patient) return <ScreenContainer edges={['bottom']}><NoAccessState /></ScreenContainer>;

  return (
    <ScreenContainer edges={['bottom']}>
      <Stack.Screen options={{ title: patient.fullName }} />
      <AppCard style={styles.access}>
        <AppText variant="caption" color="textMuted">
          {t('doctor.accessUntil', { date: formatDateTime(session.expiresAt) })}
        </AppText>
        <View style={styles.badges}>
          {session.scopes.map((s) => (
            <Badge key={s} label={t(`passport.scopes.${s}`)} color={colors.primary} />
          ))}
        </View>
      </AppCard>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <AppButton title={t('doctor.documents')} icon="folder-open-outline" variant="outline" fullWidth
            onPress={() => router.push({ pathname: '/doctor/patient/[id]/documents', params: { id: patient.id } })} />
        </View>
        <View style={styles.flex}>
          <AppButton title="LungVision" icon="scan-outline" variant="outline" fullWidth
            onPress={() => router.push({ pathname: '/doctor/patient/[id]/lungvision', params: { id: patient.id } })} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('doctor.summary')} subtitle={t('doctor.summarySubtitle')} />
        <AppButton
          title={voice.data ? t('doctor.regenerate') : t('doctor.generate')}
          icon="volume-high-outline"
          variant="secondary"
          loading={voice.isLoading}
          onPress={() => void voice.run({ patientId: patient.id, language: 'en' })}
        />
        {voice.error && <ErrorState message={voice.error} />}
        {voice.data && (
          <AppCard style={styles.section}>
            <AppText>{voice.data.text}</AppText>
            {/* TODO(mobile): play voice.data.audioUrl with expo-audio when the backend returns it. */}
            <AppText variant="caption" color="textMuted">
              {voice.data.audioUrl ? t('doctor.audioReady') : t('doctor.audioNotYet')}
            </AppText>
            {voice.data.isDemo && <DemoNotice message={t('doctor.summaryDemo')} />}
          </AppCard>
        )}
      </View>

      <ProfileSections profile={patient} />

      <View style={styles.section}>
        <SectionHeader title={t('doctor.recentHistory')} />
        {session.scopes.includes('history') ? (
          <MedicalEventList events={patient.history.slice(0, 5)} />
        ) : (
          <ErrorState title={t('doctor.notShared')} message={t('doctor.historyNotShared')} />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  access: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
});
