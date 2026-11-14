import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, EmptyState, ErrorState, LoadingState, ScreenContainer, SectionHeader, SegmentedControl } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { confirmAction } from '@/screens/patient/smart-care/AppointmentsScreen';
import { AppointmentCard } from '@/screens/shared/components/AppointmentCard';
import { SlotPicker } from '@/screens/shared/components/SlotPicker';
import { api } from '@/services/backend';
import type { Appointment, AvailabilityCreate, Slot } from '@/types';
import { formatDay } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const TABS = ['requests', 'availability'] as const;
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const LENGTHS = ['1', '2', '3', '4'] as const;
const SLOT_MINUTES = ['15', '20', '30', '45', '60'] as const;

/** Doctor: booking requests addressed to them (accept / reject / propose another slot) and their own calendar. */
export function DoctorAppointmentsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>('requests');
  return (
    <ScreenContainer edges={['bottom']} help="doctorAppointments">
      <SegmentedControl options={TABS} value={tab} onChange={setTab} getLabel={(v) => t(`care.doctor.tabs.${v}`)} />
      {tab === 'requests' ? <Requests /> : <Availability />}
    </ScreenContainer>
  );
}

function Requests() {
  const { t } = useTranslation();
  const language = useLanguage();
  const load = useCallback(() => api.listDoctorAppointments(language), [language]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const respond = useSubmit(api.respondAppointment);
  const [proposing, setProposing] = useState<string | null>(null);

  const answer = async (a: Appointment, action: 'accept' | 'reject', note?: string) => {
    if (await respond.run(a.id, { action, note: note ?? null }, language)) await reload();
  };

  const pending = (data ?? []).filter((a) => a.status === 'requested');
  const others = (data ?? []).filter((a) => a.status !== 'requested');

  return (
    <View style={styles.section}>
      <AppButton title={t('care.doctor.refresh')} icon="refresh-outline" variant="ghost" size="sm" loading={isLoading && !!data} onPress={() => void reload()} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={2} />}
      {respond.error && <ErrorState compact message={respond.error} />}
      {data && data.length === 0 && <EmptyState icon="calendar-outline" title={t('care.doctor.noRequests')} message={t('care.doctor.noRequestsHint')} />}

      {pending.length > 0 && <SectionHeader title={t('care.doctor.pending', { count: pending.length })} />}
      {pending.map((a) => (
        <AppointmentCard key={a.id} appointment={a} perspective="doctor">
          {proposing === a.id ? (
            <ProposeForm
              appointment={a}
              onCancel={() => setProposing(null)}
              onSent={async () => {
                setProposing(null);
                await reload();
              }}
            />
          ) : (
            <View style={styles.actions}>
              <AppButton title={t('care.doctor.accept')} icon="checkmark-outline" size="sm" loading={respond.isLoading} onPress={() => void answer(a, 'accept')} />
              <AppButton title={t('care.doctor.propose')} icon="swap-horizontal-outline" variant="outline" size="sm" disabled={respond.isLoading} onPress={() => setProposing(a.id)} />
              <AppButton
                title={t('care.doctor.reject')}
                icon="close-outline"
                variant="ghost"
                size="sm"
                disabled={respond.isLoading}
                onPress={() => confirmAction(t('care.doctor.rejectTitle'), t('care.doctor.rejectText'), t('care.doctor.reject'), t('common.cancel'), () => void answer(a, 'reject'))}
              />
            </View>
          )}
        </AppointmentCard>
      ))}

      {others.length > 0 && <SectionHeader title={t('care.doctor.others')} />}
      {others.map((a) => (
        <AppointmentCard key={a.id} appointment={a} perspective="doctor" />
      ))}
      {data && (
        <AppText variant="caption" color="textSubtle">
          {t('care.doctor.privacy')}
        </AppText>
      )}
    </View>
  );
}

function ProposeForm({ appointment, onCancel, onSent }: { appointment: Appointment; onCancel: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const free = useAsync(api.listMyFreeSlots);
  const respond = useSubmit(api.respondAppointment);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');

  const send = async () => {
    if (!slot) return;
    if (await respond.run(appointment.id, { action: 'propose', slotId: slot.id, note: note.trim() || null }, language)) onSent();
    else void free.reload();
  };

  return (
    <View style={styles.section}>
      <AppText variant="label" color="textMuted">
        {t('care.doctor.proposeHint')}
      </AppText>
      {!free.data && !free.error && <LoadingState count={1} />}
      {free.error && <ErrorState compact message={free.error} />}
      {free.data && free.data.length === 0 && <AppText color="textMuted">{t('care.doctor.noFreeSlots')}</AppText>}
      {free.data && free.data.length > 0 && <SlotPicker slots={free.data.slice(0, 40)} selectedId={slot?.id} onSelect={setSlot} />}
      <AppInput label={t('care.doctor.noteLabel')} value={note} onChangeText={setNote} maxLength={300} />
      <View style={styles.actions}>
        <AppButton title={t('care.doctor.sendProposal')} icon="send-outline" size="sm" disabled={!slot} loading={respond.isLoading} onPress={() => void send()} />
        <AppButton title={t('common.cancel')} variant="ghost" size="sm" onPress={onCancel} />
      </View>
      {respond.error && <ErrorState compact message={respond.error} />}
    </View>
  );
}

function Availability() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const mine = useAsync(api.listMyAvailability, { refetchOnFocus: true });
  const free = useAsync(api.listMyFreeSlots, { refetchOnFocus: true });
  const add = useSubmit(api.addAvailability);
  const remove = useSubmit(api.deleteAvailability);
  const days = useMemo(() => {
    const out: Date[] = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) out.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    return out;
  }, []);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(9);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('2');
  const [minutes, setMinutes] = useState<(typeof SLOT_MINUTES)[number]>('30');

  const reloadAll = async () => {
    await Promise.all([mine.reload(), free.reload()]);
  };
  const publish = async () => {
    const d = days[day];
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0);
    const end = new Date(start.getTime() + Number(length) * 3_600_000);
    const body: AvailabilityCreate = { startsAt: start.toISOString(), endsAt: end.toISOString(), slotMinutes: Number(minutes) as AvailabilityCreate['slotMinutes'] };
    if (await add.run(body)) await reloadAll();
  };
  const booked = useMemo(() => {
    const freeIds = new Set((free.data ?? []).map((s) => s.id));
    return new Set((mine.data ?? []).filter((s) => !freeIds.has(s.id)).map((s) => s.id));
  }, [mine.data, free.data]);

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
    >
      <AppText variant="label" style={{ color: selected ? colors.background : colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <AppCard style={styles.section}>
        <AppText variant="subheading">{t('care.doctor.addTitle')}</AppText>
        <AppText variant="label" color="textMuted">
          {t('care.doctor.day')}
        </AppText>
        <View style={styles.chips}>{days.map((d, i) => chip(formatDay(d.toISOString()), i === day, () => setDay(i), `d${i}`))}</View>
        <AppText variant="label" color="textMuted">
          {t('care.doctor.from')}
        </AppText>
        <View style={styles.chips}>{HOURS.map((h) => chip(`${String(h).padStart(2, '0')}:00`, h === hour, () => setHour(h), `h${h}`))}</View>
        <AppText variant="label" color="textMuted">
          {t('care.doctor.length')}
        </AppText>
        <SegmentedControl options={LENGTHS} value={length} onChange={setLength} getLabel={(v) => t('care.doctor.hours', { count: Number(v) })} />
        <AppText variant="label" color="textMuted">
          {t('care.doctor.slotLength')}
        </AppText>
        <SegmentedControl options={SLOT_MINUTES} value={minutes} onChange={setMinutes} getLabel={(v) => `${v} min`} />
        <AppButton title={t('care.doctor.publish')} icon="add-circle-outline" fullWidth loading={add.isLoading} onPress={() => void publish()} />
        {add.data && (
          <AppText variant="caption" color="success">
            {t('care.doctor.added', { count: add.data.added })}
          </AppText>
        )}
        {add.error && <ErrorState compact message={add.error} />}
      </AppCard>

      <SectionHeader title={t('care.doctor.mySlots')} subtitle={t('care.doctor.mySlotsHint')} />
      {mine.error && !mine.data && <ErrorState message={mine.error} onRetry={mine.reload} />}
      {!mine.data && !mine.error && <LoadingState count={1} />}
      {mine.data && mine.data.length === 0 && <EmptyState icon="calendar-outline" title={t('care.doctor.noSlots')} message={t('care.doctor.noSlotsHint')} />}
      {mine.data && mine.data.length > 0 && (
        <SlotPicker
          slots={mine.data}
          booked={booked}
          onSelect={(s) =>
            confirmAction(
              t('care.doctor.deleteTitle'),
              `${formatDay(s.startsAt)} · ${new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              t('care.doctor.delete'),
              t('common.cancel'),
              async () => {
                if ((await remove.run(s.id)) !== null) await reloadAll();
              },
            )
          }
        />
      )}
      {remove.error && <ErrorState compact message={remove.error} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
});
