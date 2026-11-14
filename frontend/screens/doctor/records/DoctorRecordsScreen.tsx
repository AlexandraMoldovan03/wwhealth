import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { ScopeBadges } from '@/screens/shared/components/ConsentBadges';
import { HubHeader } from '@/screens/shared/components/HubHeader';
import { api } from '@/services/backend';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const listPatients = () => api.listDoctorPatients();

/**
 * Doctor "Medical records": the records a doctor may open right now — active consents only, with exactly the
 * sections the patient shared (the backend re-checks every request). Plus the doctor's emergency access log.
 */
export function DoctorRecordsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const patients = useAsync(listPatients, { refetchOnFocus: true });
  const active = (patients.data ?? []).filter((p) => p.status === 'active');
  const open = (pathname: '/doctor/patient/[id]' | '/doctor/patient/[id]/documents' | '/doctor/patient/[id]/labs' | '/doctor/patient/[id]/intelligence', id: string) =>
    router.push({ pathname, params: { id } });

  return (
    <ScreenContainer
      help="doctorRecords"
      refreshControl={<RefreshControl refreshing={patients.isLoading && !!patients.data} onRefresh={patients.reload} tintColor={colors.primary} />}
    >
      <HubHeader title={t('hubs.doctorRecords.title')} subtitle={t('hubs.doctorRecords.subtitle')} />

      <View style={styles.section}>
        <SectionHeader title={t('hubs.doctorRecords.available')} />
        {patients.error && !patients.data ? (
          <ErrorState message={patients.error} onRetry={patients.reload} />
        ) : !patients.data ? (
          <LoadingState count={2} />
        ) : active.length === 0 ? (
          <EmptyState
            icon="folder-open-outline"
            title={t('hubs.doctorRecords.empty')}
            message={t('hubs.doctorRecords.emptyHint')}
            actionLabel={t('hubs.doctorRecords.seePatients')}
            onAction={() => router.navigate('/patients')}
          />
        ) : (
          active.map((p, i) => (
            <AppCard key={p.grantId} enterIndex={i + 1} style={styles.card}>
              <AppText variant="heading">{p.fullName || t('consent.doctor.thePatient')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('consent.doctor.accessUntil', { date: formatDateTime(p.expiresAt) })}
              </AppText>
              <ScopeBadges scopes={p.scopes} />
              <View style={styles.actions}>
                <AppButton title={t('hubs.doctorRecords.summary')} icon="reader-outline" size="sm" variant="outline" onPress={() => open('/doctor/patient/[id]', p.patientId)} />
                {p.scopes.includes('documents') && (
                  <AppButton title={t('consent.doctor.documents')} icon="folder-open-outline" size="sm" variant="outline" onPress={() => open('/doctor/patient/[id]/documents', p.patientId)} />
                )}
                {p.scopes.includes('labs') && (
                  <AppButton title={t('consent.doctor.labHistory')} icon="analytics-outline" size="sm" variant="outline" onPress={() => open('/doctor/patient/[id]/labs', p.patientId)} />
                )}
                <AppButton title={t('hubs.doctorRecords.ai')} icon="sparkles-outline" size="sm" variant="outline" onPress={() => open('/doctor/patient/[id]/intelligence', p.patientId)} />
              </View>
            </AppCard>
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('hubs.doctorRecords.emergencyTitle')} subtitle={t('hubs.doctorRecords.emergencySubtitle')} />
        <ListRow
          icon="shield-checkmark-outline"
          iconColor={colors.accent}
          title={t('doctor.accessLog.title')}
          subtitle={t('hubs.doctorRecords.accessLogHint')}
          onPress={() => router.navigate('/access')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
