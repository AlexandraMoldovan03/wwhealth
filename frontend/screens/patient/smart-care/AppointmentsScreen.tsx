import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, EmptyState, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { AppointmentCard } from '@/screens/shared/components/AppointmentCard';
import { api } from '@/services/backend';
import type { Appointment, PatientAppointmentAction } from '@/types';
import { useTranslation } from 'react-i18next';

const ACTIVE = new Set(['requested', 'proposed', 'confirmed']);

export function confirmAction(title: string, message: string, yes: string, cancel: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}

/** The patient's appointments: pending requests, proposals to confirm, confirmed visits, history. */
export function AppointmentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const load = useCallback(() => api.listMyAppointments(language), [language]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const act = useSubmit(api.updateMyAppointment);

  const run = async (a: Appointment, action: PatientAppointmentAction) => {
    await act.run(a.id, action, language);
    await reload();
  };
  const cancel = (a: Appointment) =>
    confirmAction(t('care.appointments.cancelTitle'), t('care.appointments.cancelText'), t('care.appointments.cancel'), t('common.cancel'), () => void run(a, 'cancel'));

  const active = (data ?? []).filter((a) => ACTIVE.has(a.status));
  const past = (data ?? []).filter((a) => !ACTIVE.has(a.status)).reverse();

  return (
    <ScreenContainer
      edges={['bottom']}
      help="appointments"
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}
    >
      <AppButton title={t('care.appointments.new')} icon="add-circle-outline" fullWidth onPress={() => router.push('/patient/smart-care')} />
      {act.error && <ErrorState compact message={act.error} />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={2} />}
      {data && data.length === 0 && (
        <EmptyState icon="calendar-outline" title={t('care.appointments.empty')} message={t('care.appointments.emptyHint')} />
      )}

      {active.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('care.appointments.active')} />
          {active.map((a, i) => (
            <AppointmentCard key={a.id} appointment={a} perspective="patient" enterIndex={i}>
              {a.status === 'proposed' && (
                <View style={styles.actions}>
                  <AppButton title={t('care.appointments.acceptProposal')} icon="checkmark-outline" size="sm" loading={act.isLoading} onPress={() => void run(a, 'accept_proposal')} />
                  <AppButton title={t('care.appointments.declineProposal')} variant="outline" size="sm" disabled={act.isLoading} onPress={() => void run(a, 'decline_proposal')} />
                </View>
              )}
              {a.status !== 'proposed' && (
                <AppButton title={t('care.appointments.cancel')} icon="close-circle-outline" variant="ghost" size="sm" disabled={act.isLoading} onPress={() => cancel(a)} />
              )}
            </AppointmentCard>
          ))}
        </View>
      )}

      {past.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('care.appointments.past')} />
          {past.map((a) => (
            <AppointmentCard key={a.id} appointment={a} perspective="patient">
              {a.status === 'rejected' && (
                <AppButton
                  title={t('care.appointments.findAnother')}
                  icon="search-outline"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    a.specialtyId
                      ? router.push({ pathname: '/patient/specialty/[id]', params: { id: a.specialtyId, name: a.specialtyName ?? '' } })
                      : router.push('/patient/specialties')
                  }
                />
              )}
            </AppointmentCard>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
