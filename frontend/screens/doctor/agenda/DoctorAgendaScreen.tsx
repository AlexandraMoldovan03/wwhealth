import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, Badge, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader, SegmentedControl } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { AppointmentCard } from '@/screens/shared/components/AppointmentCard';
import { api } from '@/services/backend';
import type { AgendaAppointment } from '@/types';
import { formatDay, formatTime, localDayKey } from '@/utils/format';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const when = (a: AgendaAppointment) => (a.status === 'proposed' && a.proposedStartsAt ? a.proposedStartsAt : a.startsAt);

/**
 * "Agenda mea": day / week calendar with appointments, new requests, free and blocked slots, and one tap to the
 * consultation sheet. Accept / reject / propose stay in the existing Appointments screen (no duplicate flow).
 */
export function DoctorAgendaScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const range = useMemo(() => {
    const from = mode === 'day' ? day : addDays(day, -((day.getDay() + 6) % 7));
    return { from, to: addDays(from, mode === 'day' ? 1 : 7) };
  }, [mode, day]);
  const load = useCallback(() => api.getAgenda(range.from.toISOString(), range.to.toISOString(), language), [range, language]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const upcomingLoad = useCallback(() => {
    const now = new Date();
    return api.getAgenda(now.toISOString(), addDays(now, 30).toISOString(), language);
  }, [language]);
  const upcoming = useAsync(upcomingLoad, { refetchOnFocus: true });

  const days = Array.from({ length: mode === 'day' ? 1 : 7 }, (_, i) => addDays(range.from, i));
  const requests = (upcoming.data?.appointments ?? []).filter((a) => a.status === 'requested');
  const next = (upcoming.data?.appointments ?? []).filter((a) => a.status === 'confirmed').slice(0, 5);
  const open = (a: AgendaAppointment) => router.push({ pathname: '/doctor/consultation/[id]', params: { id: a.id } });
  const shift = (n: number) => setDay((d) => addDays(d, mode === 'day' ? n : 7 * n));

  return (
    <ScreenContainer edges={['bottom']} help="agenda"
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={() => { void reload(); void upcoming.reload(); }} tintColor={colors.primary} />}>
      <View style={styles.actions}>
        <AppButton title={t('cj.agenda.schedule')} icon="settings-outline" variant="outline" size="sm" onPress={() => router.push('/doctor/schedule')} />
        <AppButton title={t('cj.agenda.requests')} icon="mail-unread-outline" variant="ghost" size="sm" onPress={() => router.push('/doctor/appointments')} />
      </View>

      {requests.length > 0 && (
        <ListRow icon="mail-unread-outline" iconColor={colors.warning} title={t('cj.agenda.newRequests', { count: requests.length })}
          subtitle={t('cj.agenda.newRequestsHint')} right={<Badge label={String(requests.length)} color={colors.warning} />} onPress={() => router.push('/doctor/appointments')} />
      )}

      <SegmentedControl options={['day', 'week'] as const} value={mode} onChange={setMode} getLabel={(v) => t(`cj.agenda.${v}`)} />
      <View style={styles.nav}>
        <AppButton title="‹" variant="ghost" size="sm" accessibilityLabel={t('cj.agenda.prev')} onPress={() => shift(-1)} />
        <Pressable accessibilityRole="button" onPress={() => setDay(startOfDay(new Date()))} style={styles.navLabel}>
          <AppText variant="subheading" align="center">
            {mode === 'day' ? formatDay(range.from.toISOString()) : `${formatDay(range.from.toISOString())} – ${formatDay(addDays(range.to, -1).toISOString())}`}
          </AppText>
          <AppText variant="caption" color="primary" align="center">{t('cj.agenda.today')}</AppText>
        </Pressable>
        <AppButton title="›" variant="ghost" size="sm" accessibilityLabel={t('cj.agenda.next')} onPress={() => shift(1)} />
      </View>

      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={2} />}

      {data && days.map((d) => {
        const key = localDayKey(d.toISOString());
        const appts = data.appointments.filter((a) => localDayKey(when(a)) === key && a.status !== 'cancelled' && a.status !== 'rejected');
        const free = data.slots.filter((s) => localDayKey(s.startsAt) === key && !s.booked && !s.blocked);
        const off = data.timeOff.filter((o) => localDayKey(o.startsAt) <= key && key <= localDayKey(o.endsAt));
        if (mode === 'week' && !appts.length && !free.length && !off.length) return null;
        return (
          <View key={key} style={styles.section}>
            {mode === 'week' && <SectionHeader title={formatDay(d.toISOString())} />}
            {off.map((o) => (
              <AppText key={o.id} variant="caption" color="warning">{t(`cj.schedule.off.${o.kind}`)}{o.note ? ` · ${o.note}` : ''}</AppText>
            ))}
            {appts.map((a) => (
              <AppointmentCard key={a.id} appointment={a} perspective="doctor">
                <View style={styles.actions}>
                  {a.prepared && <Badge label={t('cj.agenda.prepared')} color={colors.success} />}
                  <AppButton title={t('cj.agenda.openSheet')} icon="document-text-outline" size="sm" variant="outline" onPress={() => open(a)} />
                </View>
              </AppointmentCard>
            ))}
            {free.length > 0 && (
              <View style={styles.section}>
                <AppText variant="label" color="textMuted">{t('cj.agenda.free', { count: free.length })}</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {free.map((s) => (
                    <View key={s.id} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <AppText variant="caption">{formatTime(s.startsAt)}</AppText>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            {mode === 'day' && !appts.length && !free.length && (
              <EmptyState icon="calendar-clear-outline" title={t('cj.agenda.emptyDay')} message={t('cj.agenda.emptyDayHint')}
                actionLabel={t('cj.agenda.schedule')} onAction={() => router.push('/doctor/schedule')} />
            )}
          </View>
        );
      })}

      {next.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('cj.agenda.upcoming')} />
          {next.map((a) => (
            <AppCard key={a.id} style={styles.row} onPress={() => open(a)}>
              <View style={styles.flex}>
                <AppText variant="subheading">{a.patientName ?? t('care.appointments.patient')}</AppText>
                <AppText variant="caption" color="textMuted">{formatDay(a.startsAt)} · {formatTime(a.startsAt)}</AppText>
              </View>
              {a.prepared && <Badge label={t('cj.agenda.prepared')} color={colors.success} />}
            </AppCard>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navLabel: { flex: 1, minHeight: 44, justifyContent: 'center' },
  chips: { gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
