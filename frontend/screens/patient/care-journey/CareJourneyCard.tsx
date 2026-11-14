import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { api } from '@/services/backend';
import { deviceTimezone } from '@/services/medicationReminders';
import { formatDay, formatTime } from '@/utils/format';

/**
 * Home — the patient's Care Journey from real data: next confirmed visit, proposals to answer, pending requests,
 * next documented dose, and only the actions that fit right now. Renders nothing when there is nothing to show.
 */
export function CareJourneyCard({ enterIndex }: { enterIndex?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const loadAppts = useCallback(() => api.listMyAppointments(language), [language]);
  const loadTreat = useCallback(() => api.getMyTreatments(deviceTimezone()), []);
  const appts = useAsync(loadAppts, { refetchOnFocus: true });
  const treat = useAsync(loadTreat, { refetchOnFocus: true });

  const now = new Date().toISOString();
  const list = appts.data ?? [];
  const next = list.filter((a) => a.status === 'confirmed' && a.endsAt > now).sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0];
  const proposals = list.filter((a) => a.status === 'proposed').length;
  const requests = list.filter((a) => a.status === 'requested' && a.startsAt > now).length;
  const lastVisit = list.filter((a) => a.status === 'confirmed' && a.endsAt <= now).sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1))[0];
  const dose = treat.data?.nextDose ?? null;
  const activePlans = treat.data?.active.length ?? 0;

  if (!appts.data && !treat.data) return null;
  if (!next && !proposals && !requests && !dose && !activePlans && !lastVisit) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={t('cj.home.title')} />
      {next && (
        <AppCard enterIndex={enterIndex} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.success }]}>
          <AppText variant="label" color="success">{t('cj.home.nextVisit')}</AppText>
          <View style={styles.row}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="heading">{formatDay(next.startsAt)} · {formatTime(next.startsAt)}</AppText>
              <AppText variant="caption" color="textMuted">{[next.doctorName, next.specialtyName].filter(Boolean).join(' · ')}</AppText>
            </View>
          </View>
          <View style={styles.actions}>
            <AppButton title={t('cj.cta.prepare')} icon="create-outline" size="sm" onPress={() => router.push({ pathname: '/patient/prepare/[id]', params: { id: next.id } })} />
            <AppButton title={t('cj.cta.viewAppointment')} variant="outline" size="sm" onPress={() => router.push('/patient/appointments')} />
          </View>
        </AppCard>
      )}
      {proposals > 0 && (
        <ListRow icon="swap-horizontal-outline" iconColor={colors.info} title={t('cj.home.proposals', { count: proposals })} subtitle={t('cj.home.proposalsHint')}
          onPress={() => router.push('/patient/appointments')} />
      )}
      {requests > 0 && (
        <ListRow icon="hourglass-outline" iconColor={colors.warning} title={t('cj.home.requests', { count: requests })} subtitle={t('cj.home.requestsHint')}
          onPress={() => router.push('/patient/appointments')} />
      )}
      {dose ? (
        <ListRow icon="alarm-outline" iconColor={colors.primary} title={t('cj.cta.nextDose')} subtitle={`${formatDay(dose.scheduledFor)} · ${formatTime(dose.scheduledFor)} · ${dose.medicationName}`}
          onPress={() => router.push('/patient/treatments')} />
      ) : activePlans > 0 ? (
        <ListRow icon="medkit-outline" iconColor={colors.primary} title={t('cj.cta.viewTreatment')} subtitle={t('cj.home.activePlans', { count: activePlans })}
          onPress={() => router.push('/patient/treatments')} />
      ) : null}
      {!next && !proposals && !requests && lastVisit && (
        <ListRow icon="repeat-outline" iconColor={colors.primary} title={t('cj.cta.followUp')} subtitle={[lastVisit.doctorName, lastVisit.specialtyName].filter(Boolean).join(' · ')}
          onPress={() => router.push({ pathname: '/patient/book/[doctorId]', params: { doctorId: lastVisit.doctorId, specialtyId: lastVisit.specialtyId ?? '', doctorName: lastVisit.doctorName ?? '', specialtyName: lastVisit.specialtyName ?? '' } })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
