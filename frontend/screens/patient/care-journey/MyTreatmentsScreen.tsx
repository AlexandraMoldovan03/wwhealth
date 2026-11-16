import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';

import { AppButton, AppCard, AppText, Badge, DemoNotice, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { CareSheet } from '@/screens/patient/smart-care/components/CareSheet';
import { TreatmentCard, TreatmentHistory } from '@/screens/shared/components/TreatmentCard';
import { api } from '@/services/backend';
import { deviceTimezone, remindersEnabled, remindersSupported, setRemindersEnabled, snoozeReminder, syncReminders } from '@/services/medicationReminders';
import type { DoseEvent, TreatmentPlan } from '@/types';
import { formatDate, formatTime } from '@/utils/format';

const SNOOZE_MINUTES = 15;

/**
 * "Tratamentele mele": today's documented doses, next dose, active / upcoming / finished plans, medication the patient
 * declared, full version history. Marking a dose records what the patient reports — it never changes the plan.
 * A missed dose is never "caught up" or doubled; the patient is pointed to the doctor's instructions instead.
 */
export function MyTreatmentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tz = deviceTimezone();
  const load = useCallback(() => api.getMyTreatments(tz), [tz]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const mark = useSubmit(api.markDose);
  const [open, setOpen] = useState<TreatmentPlan | null>(null);
  const [dose, setDose] = useState<DoseEvent | null>(null);
  const [canSnooze, setCanSnooze] = useState(false);
  const [notify, setNotify] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const text = { title: t('cj.remind.title'), body: t('cj.remind.body') };

  useEffect(() => {
    void remindersEnabled().then(setNotify);
  }, []);

  const resync = useCallback(async (force = false) => {
    try {
      await syncReminders(await api.getReminderSchedule(tz), { title: t('cj.remind.title'), body: t('cj.remind.body') }, force);
    } catch {
      // Reminders are a convenience; the screen still works without them.
    }
  }, [tz, t]);

  useEffect(() => {
    if (data && notify) void resync();
  }, [data, notify, resync]);

  const toggle = async (on: boolean) => {
    const ok = await setRemindersEnabled(on);
    if (on && !ok) return setNotice(t('cj.remind.denied'));
    setNotice(null);
    setNotify(on);
    if (on) await resync(true);
  };

  const record = async (d: DoseEvent, status: 'taken' | 'skipped') => {
    await mark.run(d.planId, d.scheduledFor, status, tz);
    setDose(null);
    await reload();
    if (notify) await resync(true);
  };

  const snooze = async (d: DoseEvent) => {
    const ok = await snoozeReminder(d.planId, d.scheduledFor, SNOOZE_MINUTES, text);
    setNotice(ok ? t('cj.remind.snoozed', { count: SNOOZE_MINUTES }) : t('cj.remind.enableFirst'));
    setDose(null);
  };

  const openDose = (d: DoseEvent) => {
    setDose(d);
    // Snooze only for a pending dose that is not long past (never to "catch up" an old dose).
    setCanSnooze(d.status === 'pending' && new Date(d.scheduledFor).getTime() > Date.now() - 3_600_000 && remindersSupported());
  };
  const planOf = (id: string) => [...(data?.active ?? []), ...(data?.upcoming ?? []), ...(data?.finished ?? [])].find((p) => p.id === id);
  const hasPlans = !!data && data.active.length + data.upcoming.length + data.finished.length > 0;
  const tone = { pending: colors.info, taken: colors.success, skipped: colors.warning } as const;

  return (
    <ScreenContainer edges={['bottom']} help="treatments" refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={3} />}
      {mark.error && <ErrorState compact message={mark.error} />}
      {!!notice && <AppText variant="caption" color="textMuted">{notice}</AppText>}

      {data && !hasPlans && data.declared.length === 0 && data.imported.length === 0 && (
        <EmptyState icon="medkit-outline" title={t('cj.treat.empty')} message={t('cj.treat.emptyHint')} />
      )}

      {data?.nextDose && (
        <AppCard enterIndex={0} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.primary }]} onPress={() => data.nextDose && openDose(data.nextDose)}>
          <AppText variant="label" color="primary">{t('cj.treat.nextDose')}</AppText>
          <AppText variant="heading">{formatTime(data.nextDose.scheduledFor)} · {data.nextDose.medicationName}</AppText>
        </AppCard>
      )}

      {data && data.today.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('cj.treat.today')} />
          {data.today.map((d) => (
            <ListRow key={`${d.planId}${d.scheduledFor}`} icon="time-outline" title={`${formatTime(d.scheduledFor)} · ${d.medicationName}`}
              right={<Badge label={t(`cj.dose.${d.status}`)} color={tone[d.status]} />} onPress={() => openDose(d)} />
          ))}
        </View>
      )}

      {remindersSupported() && hasPlans && (
        <AppCard style={styles.switchRow}>
          <View style={styles.flex}>
            <AppText variant="subheading">{t('cj.remind.toggle')}</AppText>
            <AppText variant="caption" color="textMuted">{t('cj.remind.privacy')}</AppText>
          </View>
          <Switch value={notify} onValueChange={(v) => void toggle(v)} accessibilityLabel={t('cj.remind.toggle')} />
        </AppCard>
      )}

      {(['active', 'upcoming', 'finished'] as const).map((k) =>
        data && data[k].length > 0 ? (
          <View key={k} style={styles.section}>
            <SectionHeader title={t(`cj.treat.section.${k}`)} />
            {data[k].map((p, i) => <TreatmentCard key={p.id} plan={p} enterIndex={i} onPress={() => setOpen(p)} />)}
          </View>
        ) : null,
      )}

      {data && data.declared.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('cj.treat.section.declared')} subtitle={t('cj.treat.declaredHint')} />
          {data.declared.map((m) => (
            <ListRow key={m.id} icon="person-outline" title={m.name} subtitle={[m.dosage, m.frequency].filter(Boolean).join(' · ')}
              right={<Badge label={t('cj.record.verification.patient_declared')} color={colors.warning} />} />
          ))}
        </View>
      )}

      {data && data.imported.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('cj.treat.section.imported')} subtitle={t('cj.treat.importedHint')} />
          {data.imported.map((m) => (
            <ListRow key={m.id} icon="document-text-outline" title={m.label}
              subtitle={[m.detail, m.documentTitle, m.eventDate && formatDate(m.eventDate)].filter(Boolean).join(' · ')}
              right={m.status ? <Badge label={t(`smart.itemStatus.${m.status}`, { defaultValue: m.status })} color={colors.info} /> : undefined}
              onPress={() => router.push({ pathname: '/patient/document/[id]', params: { id: m.documentId } })} />
          ))}
        </View>
      )}

      {hasPlans && <DemoNotice message={t('cj.treat.notCnas')} />}

      {open && (
        <CareSheet title={open.current.medicationName} onClose={() => setOpen(null)}>
          <TreatmentCard plan={open} />
          {!!open.current.instructions && (
            <AppCard style={styles.card}>
              <AppText variant="label" color="textMuted">{t('cj.treat.instructions')}</AppText>
              <AppText>{open.current.instructions}</AppText>
            </AppCard>
          )}
          {open.current.scheduleType !== 'fixed_times' && <AppText variant="caption" color="textMuted">{t('cj.treat.noTimes')}</AppText>}
          <SectionHeader title={t('cj.treat.history')} />
          <TreatmentHistory plan={open} />
        </CareSheet>
      )}

      {dose && (
        <CareSheet title={`${formatTime(dose.scheduledFor)} · ${dose.medicationName}`} onClose={() => setDose(null)}>
          {!!planOf(dose.planId)?.current.instructions && <AppText>{planOf(dose.planId)?.current.instructions}</AppText>}
          <AppText variant="caption" color="textMuted">{t('cj.dose.missedNote')}</AppText>
          <View style={styles.actions}>
            <AppButton title={t('cj.dose.markTaken')} icon="checkmark-outline" loading={mark.isLoading} onPress={() => void record(dose, 'taken')} />
            <AppButton title={t('cj.dose.markSkipped')} variant="outline" disabled={mark.isLoading} onPress={() => void record(dose, 'skipped')} />
            {canSnooze && (
              <AppButton title={t('cj.dose.snooze', { count: SNOOZE_MINUTES })} icon="alarm-outline" variant="ghost" onPress={() => void snooze(dose)} />
            )}
          </View>
        </CareSheet>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
  actions: { gap: spacing.sm },
});
