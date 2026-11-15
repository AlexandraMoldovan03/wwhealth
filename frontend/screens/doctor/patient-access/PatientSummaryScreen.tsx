import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, ListRow } from '@/design-system';
import { useTheme } from '@/design-system/useTheme';
import { spacing } from '@/design-system/theme';
import { ScopeBadges } from '@/screens/shared/components/ConsentBadges';
import { ExportPanel } from '@/screens/shared/components/ExportPanel';
import { MedicalSummaryView } from '@/screens/shared/components/MedicalSummaryView';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import { PatientGate } from './components/PatientGate';

/** Patient Summary (doctor view): only the sections the patient shared, while the consent is valid. No AI. */
export function PatientSummaryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <PatientGate>
      {(view) => (
        <>
          <Stack.Screen options={{ title: view.patientName ?? t('consent.doctor.thePatient') }} />
          <AppCard style={styles.access} enterIndex={0}>
            <AppText variant="heading">{view.patientName}</AppText>
            {!!view.expiresAt && (
              <AppText variant="caption" color="textMuted">
                {t('consent.doctor.accessUntil', { date: formatDateTime(view.expiresAt) })}
              </AppText>
            )}
            <ScopeBadges scopes={view.scopes} />
          </AppCard>

          {(view.scopes.includes('documents') || view.scopes.includes('labs')) && (
            <View style={styles.actions}>
              {view.scopes.includes('documents') && (
                <View style={styles.flex}>
                  <AppButton
                    title={t('consent.doctor.documents')}
                    icon="folder-open-outline"
                    variant="outline"
                    fullWidth
                    onPress={() => router.push({ pathname: '/doctor/patient/[id]/documents', params: { id: view.patientId } })}
                  />
                </View>
              )}
              {view.scopes.includes('labs') && (
                <View style={styles.flex}>
                  <AppButton
                    title={t('consent.doctor.labHistory')}
                    icon="analytics-outline"
                    variant="outline"
                    fullWidth
                    onPress={() => router.push({ pathname: '/doctor/patient/[id]/labs', params: { id: view.patientId } })}
                  />
                </View>
              )}
            </View>
          )}

          <ListRow
            icon="sparkles-outline"
            iconColor={colors.accent}
            title={t('ai.title')}
            subtitle={t('ai.doctorEntryHint')}
            onPress={() => router.push({ pathname: '/doctor/patient/[id]/intelligence', params: { id: view.patientId } })}
          />

          {view.summary && (
            <MedicalSummaryView
              summary={view.summary}
              onOpenDocument={(doc) =>
                router.push({ pathname: '/doctor/patient/[id]/document/[docId]', params: { id: view.patientId, docId: doc.id } })
              }
            />
          )}
          <ExportPanel patientId={view.patientId} />
        </>
      )}
    </PatientGate>
  );
}

const styles = StyleSheet.create({
  access: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
