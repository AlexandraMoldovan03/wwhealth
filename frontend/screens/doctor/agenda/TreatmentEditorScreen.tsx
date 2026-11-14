import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppInput, AppText, DemoNotice, ErrorState, LoadingState, ScreenContainer, SectionHeader, SegmentedControl } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { confirmAction } from '@/screens/patient/smart-care/AppointmentsScreen';
import { TreatmentCard, TreatmentHistory } from '@/screens/shared/components/TreatmentCard';
import { api } from '@/services/backend';
import type { PlanKind, PlanVersionInput, ScheduleType, TreatmentPlan } from '@/types';

const KINDS = ['prescription', 'instructions'] as const;
const SCHEDULES = ['fixed_times', 'as_needed', 'undocumented'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Form = Record<'medicationName' | 'activeSubstance' | 'strength' | 'dosageForm' | 'doseAmount' | 'doseUnit' | 'route' | 'times' | 'frequencyText' | 'startDate' | 'endDate' | 'instructions', string>;
const empty = (): Form => ({ medicationName: '', activeSubstance: '', strength: '', dosageForm: '', doseAmount: '', doseUnit: '', route: '', times: '', frequencyText: '', startDate: today(), endDate: '', instructions: '' });
const fromPlan = (p: TreatmentPlan): Form => {
  const v = p.current;
  return { medicationName: v.medicationName, activeSubstance: v.activeSubstance ?? '', strength: v.strength ?? '', dosageForm: v.dosageForm ?? '',
    doseAmount: v.doseAmount != null ? String(v.doseAmount) : '', doseUnit: v.doseUnit ?? '', route: v.route ?? '', times: v.timesOfDay.join(', '),
    frequencyText: v.frequencyText ?? '', startDate: v.startDate, endDate: v.endDate ?? '', instructions: v.instructions ?? '' };
};

/**
 * Doctor: create / modify / end a WWHealth treatment plan. Requires an active 'profile' grant (checked in the backend
 * and RLS); only the prescriber can change it; every change is a new immutable version. Written by the doctor only —
 * never generated or changed by AI. Not an official CNAS e-prescription.
 */
export function TreatmentEditorScreen() {
  const { patientId, appointmentId, planId } = useLocalSearchParams<{ patientId: string; appointmentId?: string; planId?: string }>();
  const load = useCallback(async () => (planId ? (await api.listPatientTreatments(patientId)).find((p) => p.id === planId) ?? null : null), [patientId, planId]);
  const existing = useAsync(load);
  if (existing.error) return <ScreenContainer edges={['bottom']}><ErrorState message={existing.error} onRetry={existing.reload} /></ScreenContainer>;
  if (existing.status !== 'success') return <ScreenContainer edges={['bottom']}><LoadingState count={4} /></ScreenContainer>;
  return <Editor patientId={patientId} appointmentId={appointmentId} plan={existing.data} />;
}

function Editor({ patientId, appointmentId, plan }: { patientId: string; appointmentId?: string; plan: TreatmentPlan | null }) {
  const { t } = useTranslation();
  const create = useSubmit(api.createTreatment);
  const update = useSubmit(api.updateTreatment);
  const end = useSubmit(api.endTreatment);
  const [kind, setKind] = useState<PlanKind>(plan?.kind ?? 'prescription');
  const [schedule, setSchedule] = useState<ScheduleType>(plan?.current.scheduleType ?? 'fixed_times');
  const [f, setF] = useState<Form>(() => (plan ? fromPlan(plan) : empty()));
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const opt = (s: string) => s.trim() || null;

  const build = (): PlanVersionInput | null => {
    const times = schedule === 'fixed_times' ? f.times.split(/[,\s]+/).filter(Boolean) : [];
    const amount = f.doseAmount.trim() ? Number(f.doseAmount.replace(',', '.')) : null;
    if (!f.medicationName.trim()) return setInvalid(t('cj.treat.err.name')), null;
    if (schedule === 'fixed_times' && (!times.length || !times.every((x) => HHMM.test(x)))) return setInvalid(t('cj.treat.err.times')), null;
    if (!YMD.test(f.startDate) || (f.endDate.trim() && (!YMD.test(f.endDate) || f.endDate < f.startDate))) return setInvalid(t('cj.treat.err.dates')), null;
    if (amount !== null && !(amount > 0)) return setInvalid(t('cj.treat.err.dose')), null;
    setInvalid(null);
    return { medicationName: f.medicationName.trim(), activeSubstance: opt(f.activeSubstance), strength: opt(f.strength), dosageForm: opt(f.dosageForm),
      doseAmount: amount, doseUnit: opt(f.doseUnit), route: opt(f.route), scheduleType: schedule, timesOfDay: times,
      frequencyText: opt(f.frequencyText), startDate: f.startDate, endDate: opt(f.endDate), instructions: opt(f.instructions) };
  };

  const save = () => {
    const body = build();
    if (!body) return;
    confirmAction(t(plan ? 'cj.treat.confirmUpdate' : 'cj.treat.confirmCreate'), t('cj.treat.confirmText'), t('common.save'), t('common.cancel'), () => {
      void (async () => {
        const res = plan
          ? await update.run(plan.id, { ...body, reason: opt(reason) })
          : await create.run({ ...body, patientId, kind, appointmentId: appointmentId ?? null });
        if (res) router.back();
      })();
    });
  };

  const finish = (status: 'discontinued' | 'cancelled') => {
    if (!plan) return;
    confirmAction(t(`cj.treat.confirm.${status}`), t('cj.treat.confirmEndText'), t(`cj.treat.end.${status}`), t('common.cancel'), () => {
      void end.run(plan.id, status, opt(reason)).then((res) => res && router.back());
    });
  };

  if (plan && !plan.canEdit) {
    return (
      <ScreenContainer edges={['bottom']}>
        <TreatmentCard plan={plan} />
        <AppText color="textMuted">{t('cj.treat.readOnly')}</AppText>
        <SectionHeader title={t('cj.treat.history')} />
        <TreatmentHistory plan={plan} />
      </ScreenContainer>
    );
  }

  const busy = create.isLoading || update.isLoading || end.isLoading;
  const err = create.error || update.error || end.error;
  return (
    <ScreenContainer edges={['bottom']} help="treatmentEditor">
      <DemoNotice message={t('cj.treat.notCnasDoctor')} />
      {!plan && (
        <>
          <SectionHeader title={t('cj.treat.kindLabel')} />
          <SegmentedControl options={KINDS} value={kind} onChange={setKind} getLabel={(v) => t(`cj.treat.kind.${v}`)} />
        </>
      )}
      <AppInput label={`${t('cj.treat.f.medicationName')} *`} value={f.medicationName} onChangeText={set('medicationName')} maxLength={160} />
      <AppInput label={t('cj.treat.f.activeSubstance')} value={f.activeSubstance} onChangeText={set('activeSubstance')} maxLength={160} />
      <View style={styles.row}>
        <View style={styles.flex}><AppInput label={t('cj.treat.f.strength')} placeholder="500 mg" value={f.strength} onChangeText={set('strength')} maxLength={60} /></View>
        <View style={styles.flex}><AppInput label={t('cj.treat.f.dosageForm')} value={f.dosageForm} onChangeText={set('dosageForm')} maxLength={60} /></View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}><AppInput label={t('cj.treat.f.doseAmount')} value={f.doseAmount} onChangeText={set('doseAmount')} keyboardType="decimal-pad" maxLength={8} /></View>
        <View style={styles.flex}><AppInput label={t('cj.treat.f.doseUnit')} value={f.doseUnit} onChangeText={set('doseUnit')} maxLength={30} /></View>
      </View>
      <AppInput label={t('cj.treat.f.route')} value={f.route} onChangeText={set('route')} maxLength={60} />

      <SectionHeader title={t('cj.treat.f.schedule')} />
      <SegmentedControl options={SCHEDULES} value={schedule} onChange={setSchedule} getLabel={(v) => t(`cj.treat.schedule.${v}`)} />
      {schedule === 'fixed_times'
        ? <AppInput label={`${t('cj.treat.f.times')} *`} placeholder="08:00, 20:00" value={f.times} onChangeText={set('times')} keyboardType="numbers-and-punctuation" maxLength={120} />
        : <AppText variant="caption" color="textMuted">{t('cj.treat.noTimesDoctor')}</AppText>}
      <AppInput label={t('cj.treat.f.frequencyText')} value={f.frequencyText} onChangeText={set('frequencyText')} maxLength={160} />
      <View style={styles.row}>
        <View style={styles.flex}><AppInput label={`${t('cj.treat.f.startDate')} *`} value={f.startDate} onChangeText={set('startDate')} maxLength={10} keyboardType="numbers-and-punctuation" /></View>
        <View style={styles.flex}><AppInput label={t('cj.treat.f.endDate')} placeholder="YYYY-MM-DD" value={f.endDate} onChangeText={set('endDate')} maxLength={10} keyboardType="numbers-and-punctuation" /></View>
      </View>
      <AppInput label={t('cj.treat.instructions')} value={f.instructions} onChangeText={set('instructions')} multiline maxLength={1500} />
      {plan && <AppInput label={t('cj.treat.reason')} value={reason} onChangeText={setReason} maxLength={300} />}

      {invalid && <AppText color="danger">{invalid}</AppText>}
      {err && <ErrorState compact message={err} />}
      <AppButton title={t(plan ? 'cj.treat.saveVersion' : 'cj.treat.create')} icon="checkmark-outline" fullWidth loading={busy} onPress={save} />

      {plan && (
        <>
          <View style={styles.row}>
            <AppButton title={t('cj.treat.end.discontinued')} variant="outline" size="sm" disabled={busy} onPress={() => finish('discontinued')} />
            <AppButton title={t('cj.treat.end.cancelled')} variant="danger" size="sm" disabled={busy} onPress={() => finish('cancelled')} />
          </View>
          <SectionHeader title={t('cj.treat.history')} />
          <TreatmentHistory plan={plan} />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, minWidth: 140 },
});
