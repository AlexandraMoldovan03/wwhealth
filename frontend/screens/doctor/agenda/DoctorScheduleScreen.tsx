import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, SectionHeader, SegmentedControl } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { currentLocale } from '@/i18n';
import { confirmAction } from '@/screens/patient/smart-care/AppointmentsScreen';
import { CareSheet } from '@/screens/patient/smart-care/components/CareSheet';
import { api } from '@/services/backend';
import { deviceTimezone } from '@/services/medicationReminders';
import type { DoctorSchedule, TimeOff, TimeOffKind, WeeklyHours } from '@/types';
import { formatDate, formatDay, formatTime } from '@/utils/format';

import { RangeCalendar, TimeField, WeekdayChips, ymd } from './components/SchedulePickers';

type Hours = { start: string; end: string; breakOn: boolean; breakStart: string; breakEnd: string };
const SLOT = ['15', '20', '30', '45', '60'] as const;
const HORIZON = ['14', '30', '60'] as const;
const KINDS = ['day_off', 'vacation', 'blocked'] as const;
const DEFAULT: Hours = { start: '09:00', end: '17:00', breakOn: false, breakStart: '13:00', breakEnd: '14:00' };
const TEMPLATES: { id: string; days: number[]; hours: Hours }[] = [
  { id: 'weekdays_9_17', days: [1, 2, 3, 4, 5], hours: { ...DEFAULT, breakOn: true } },
  { id: 'weekdays_8_14', days: [1, 2, 3, 4, 5], hours: { ...DEFAULT, start: '08:00', end: '14:00' } },
  { id: 'weekdays_14_20', days: [1, 2, 3, 4, 5], hours: { ...DEFAULT, start: '14:00', end: '20:00' } },
];

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const same = (a: Hours, b: Hours) =>
  a.start === b.start && a.end === b.end && a.breakOn === b.breakOn && (!a.breakOn || (a.breakStart === b.breakStart && a.breakEnd === b.breakEnd));
const weekdayLong = (w: number) => new Date(2024, 0, w).toLocaleDateString(currentLocale(), { weekday: 'long' }); // 2024-01-01 = Monday

/** Slots one day produces — the same rule the server uses (no slot crosses the end or a break). */
function slotsPerDay(h: Hours, slot: number): number {
  let n = 0;
  for (let t = mins(h.start); t + slot <= mins(h.end); t += slot) {
    if (h.breakOn && t < mins(h.breakEnd) && mins(h.breakStart) < t + slot) continue;
    n++;
  }
  return n;
}

function fromHours(hours: WeeklyHours[]) {
  const perDay: Record<number, Hours> = {};
  for (const w of [1, 2, 3, 4, 5, 6, 7]) {
    const work = hours.find((h) => h.weekday === w && h.kind === 'work');
    if (!work) continue;
    const br = hours.find((h) => h.weekday === w && h.kind === 'break');
    perDay[w] = { start: work.start.slice(0, 5), end: work.end.slice(0, 5), breakOn: !!br, breakStart: br?.start.slice(0, 5) ?? DEFAULT.breakStart, breakEnd: br?.end.slice(0, 5) ?? DEFAULT.breakEnd };
  }
  const days = Object.keys(perDay).map(Number);
  const first = days.length ? perDay[days[0]] : DEFAULT;
  return { days, perDay, common: first, custom: days.some((w) => !same(perDay[w], first)) };
}

/** Local midnight of `date` / of the day after `date` → ISO, in the device timezone (DST handled by the platform). */
const dayStartIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const dayAfterIso = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
};

/**
 * Doctor's work schedule, built for a phone: days as chips, hours from a grid (no typing), days off on a calendar.
 * A live preview shows how many consultations patients can book; the status card shows the REAL free slots of the
 * next 7 days. Saving regenerates only FREE future slots — booked appointments are never touched.
 */
export function DoctorScheduleScreen() {
  const sched = useAsync(api.getMySchedule);
  if (sched.error && !sched.data) return <ScreenContainer edges={['bottom']}><ErrorState message={sched.error} onRetry={sched.reload} /></ScreenContainer>;
  if (!sched.data) return <ScreenContainer edges={['bottom']}><LoadingState count={4} /></ScreenContainer>;
  return <ScheduleForm initial={sched.data} />;
}

function ScheduleForm({ initial }: { initial: DoctorSchedule }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const [start] = useState(() => fromHours(initial.hours));
  const [configured, setConfigured] = useState(initial.configured);
  const [days, setDays] = useState<number[]>(initial.configured ? start.days : [1, 2, 3, 4, 5]);
  const [common, setCommon] = useState<Hours>(start.common);
  const [custom, setCustom] = useState(start.custom);
  const [perDay, setPerDay] = useState<Record<number, Hours>>(start.perDay);
  const [slot, setSlot] = useState<(typeof SLOT)[number]>(SLOT.find((x) => Number(x) === initial.slotMinutes) ?? '30');
  const [horizon, setHorizon] = useState<(typeof HORIZON)[number]>(HORIZON.find((x) => Number(x) === initial.horizonDays) ?? '30');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const save = useSubmit(api.saveMySchedule);

  const loadWeek = useCallback(() => {
    const now = new Date();
    return api.getAgenda(now.toISOString(), new Date(now.getTime() + 7 * 86_400_000).toISOString(), language);
  }, [language]);
  const week = useAsync(loadWeek, { refetchOnFocus: true });
  const free = (week.data?.slots ?? []).filter((s) => !s.booked && !s.blocked);
  const nextFree = free[0];

  const hoursOf = (w: number) => (custom ? perDay[w] ?? common : common);
  const toggleDay = (w: number) => setDays((d) => (d.includes(w) ? d.filter((x) => x !== w) : [...d, w].sort()));
  const setDay = (w: number, patch: Partial<Hours>) => setPerDay((p) => ({ ...p, [w]: { ...(p[w] ?? common), ...patch } }));
  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setDays(tpl.days);
    setCommon(tpl.hours);
    setCustom(false);
    setSaved(null);
  };
  const weekly = days.reduce((n, w) => n + slotsPerDay(hoursOf(w), Number(slot)), 0);

  const submit = async () => {
    setInvalid(null);
    setSaved(null);
    const hours: WeeklyHours[] = [];
    for (const w of days) {
      const h = hoursOf(w);
      if (h.end <= h.start || (h.breakOn && (h.breakEnd <= h.breakStart || h.breakStart <= h.start || h.breakEnd >= h.end))) {
        return setInvalid(t('cj.schedule.invalidDay', { day: weekdayLong(w) }));
      }
      hours.push({ weekday: w, kind: 'work', start: h.start, end: h.end });
      if (h.breakOn) hours.push({ weekday: w, kind: 'break', start: h.breakStart, end: h.breakEnd });
    }
    const res = await save.run({ timezone: deviceTimezone(), slotMinutes: Number(slot) as DoctorSchedule['slotMinutes'], horizonDays: Number(horizon), hours, configured: true });
    if (!res) return;
    setConfigured(true);
    setSaved(t('cj.schedule.saved', { added: res.added, removed: res.removed }));
    await week.reload();
  };

  const ok = configured && free.length > 0;
  return (
    <ScreenContainer edges={['bottom']} help="schedule">
      {/* What patients can book right now — the real proof that the schedule works. */}
      <AppCard style={[styles.card, { borderLeftWidth: 4, borderLeftColor: ok ? colors.success : colors.warning }]}>
        <AppText variant="label" color={ok ? 'success' : 'warning'}>{t('cj.schedule.statusTitle')}</AppText>
        {!configured ? (
          <AppText>{t('cj.schedule.notConfigured')}</AppText>
        ) : week.data ? (
          <>
            <AppText variant="heading">{t('cj.schedule.freeWeek', { count: free.length })}</AppText>
            <AppText color="textMuted">
              {nextFree ? t('cj.schedule.nextFree', { when: `${formatDay(nextFree.startsAt)} · ${formatTime(nextFree.startsAt)}` }) : t('cj.schedule.noFreeWeek')}
            </AppText>
          </>
        ) : week.error ? (
          <ErrorState compact message={week.error} onRetry={week.reload} />
        ) : (
          <LoadingState count={1} />
        )}
        {configured && <AppButton title={t('cj.schedule.seeAgenda')} icon="calendar-outline" variant="outline" size="sm" onPress={() => router.push('/doctor/agenda')} />}
      </AppCard>

      <SectionHeader title={t('cj.schedule.step1')} subtitle={t('cj.schedule.templatesHint')} />
      <View style={styles.wrap}>
        {TEMPLATES.map((tpl) => (
          <AppButton key={tpl.id} title={t(`cj.schedule.tpl.${tpl.id}`)} variant="outline" size="sm" onPress={() => applyTemplate(tpl)} />
        ))}
      </View>
      <WeekdayChips value={days} onToggle={toggleDay} />

      {days.length > 0 && !custom && (
        <AppCard style={styles.card}>
          <View style={styles.row}>
            <TimeField label={t('cj.schedule.start')} value={common.start} max={common.end} onChange={(v) => setCommon((c) => ({ ...c, start: v }))} />
            <TimeField label={t('cj.schedule.end')} value={common.end} min={common.start} onChange={(v) => setCommon((c) => ({ ...c, end: v }))} />
          </View>
          <BreakEditor h={common} onChange={(p) => setCommon((c) => ({ ...c, ...p }))} />
        </AppCard>
      )}

      {days.length > 0 && custom && days.map((w) => {
        const h = hoursOf(w);
        return (
          <AppCard key={w} style={styles.card}>
            <AppText variant="subheading">{weekdayLong(w)}</AppText>
            <View style={styles.row}>
              <TimeField label={t('cj.schedule.start')} value={h.start} max={h.end} onChange={(v) => setDay(w, { start: v })} />
              <TimeField label={t('cj.schedule.end')} value={h.end} min={h.start} onChange={(v) => setDay(w, { end: v })} />
            </View>
            <BreakEditor h={h} onChange={(p) => setDay(w, p)} />
          </AppCard>
        );
      })}

      {days.length > 1 && (
        <View style={styles.row}>
          <AppText color="textMuted" style={styles.flex}>{t('cj.schedule.customDays')}</AppText>
          <Switch value={custom} accessibilityLabel={t('cj.schedule.customDays')}
            onValueChange={(on) => {
              if (on) setPerDay(Object.fromEntries(days.map((w) => [w, perDay[w] ?? common])));
              setCustom(on);
            }} />
        </View>
      )}

      <SectionHeader title={t('cj.schedule.slot')} />
      <SegmentedControl options={SLOT} value={slot} onChange={setSlot} getLabel={(v) => `${v} min`} />
      <SectionHeader title={t('cj.schedule.horizon')} />
      <SegmentedControl options={HORIZON} value={horizon} onChange={setHorizon} getLabel={(v) => t('cj.schedule.days', { count: Number(v) })} />

      <AppCard style={styles.card}>
        <AppText variant="label" color="textMuted">{t('cj.schedule.preview')}</AppText>
        <AppText variant="subheading">{days.length ? t('cj.schedule.previewWeekly', { count: weekly }) : t('cj.schedule.previewNone')}</AppText>
        {days.map((w) => {
          const h = hoursOf(w);
          return (
            <AppText key={w} variant="caption" color="textMuted">
              {weekdayLong(w)}: {h.start}–{h.end}
              {h.breakOn ? ` (${t('cj.schedule.break').toLowerCase()} ${h.breakStart}–${h.breakEnd})` : ''} · {t('cj.schedule.slotsCount', { count: slotsPerDay(h, Number(slot)) })}
            </AppText>
          );
        })}
      </AppCard>

      {invalid && <AppText color="danger">{invalid}</AppText>}
      {save.error && <ErrorState compact message={save.error} />}
      {saved && <AppText color="success">✓ {saved}</AppText>}
      <AppButton title={t('cj.schedule.save')} icon="checkmark-outline" fullWidth loading={save.isLoading} onPress={() => void submit()} />
      <AppText variant="caption" color="textMuted">{t('cj.schedule.safe')} {t('cj.schedule.tz', { tz: deviceTimezone() })}</AppText>

      <TimeOffSection onChange={() => void week.reload()} />
    </ScreenContainer>
  );
}

function BreakEditor({ h, onChange }: { h: Hours; onChange: (p: Partial<Hours>) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.row}>
        <AppText color="textMuted" style={styles.flex}>{t('cj.schedule.break')}</AppText>
        <Switch value={h.breakOn} onValueChange={(breakOn) => onChange({ breakOn })} accessibilityLabel={t('cj.schedule.break')} />
      </View>
      {h.breakOn && (
        <View style={styles.row}>
          <TimeField label={t('cj.schedule.breakFrom')} value={h.breakStart} min={h.start} max={h.breakEnd} onChange={(v) => onChange({ breakStart: v })} />
          <TimeField label={t('cj.schedule.breakTo')} value={h.breakEnd} min={h.breakStart} max={h.end} onChange={(v) => onChange({ breakEnd: v })} />
        </View>
      )}
    </>
  );
}

function TimeOffSection({ onChange }: { onChange: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const off = useAsync(api.listMyTimeOff, { refetchOnFocus: true });
  const add = useSubmit(api.addTimeOff);
  const del = useSubmit(api.deleteTimeOff);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TimeOffKind>('day_off');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState('09:00');
  const [toTime, setToTime] = useState('12:00');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const openSheet = (k: TimeOffKind, day?: string) => {
    setKind(k);
    setFrom(day ?? null);
    setTo(null);
    setNote('');
    add.reset();
    setOpen(true);
  };
  const quick = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    openSheet('day_off', ymd(d));
  };
  const noon = (s: string) => new Date(`${s}T12:00:00`).getTime();
  const nDays = from ? Math.round((noon(to ?? from) - noon(from)) / 86_400_000) + 1 : 0;

  const submit = async () => {
    if (!from) return;
    const blocked = kind === 'blocked';
    const startsAt = blocked ? new Date(`${from}T${fromTime}:00`).toISOString() : dayStartIso(from);
    const endsAt = blocked ? new Date(`${from}T${toTime}:00`).toISOString() : dayAfterIso(to ?? from);
    const res = await add.run({ kind, startsAt, endsAt, note: note.trim() || null });
    if (!res) return;
    setOpen(false);
    setMsg(res.conflicts ? t('cj.schedule.conflicts', { count: res.conflicts }) : t('cj.schedule.offAdded'));
    await off.reload();
    onChange();
  };

  const remove = (o: TimeOff) =>
    confirmAction(t('cj.schedule.removeTitle'), t('cj.schedule.removeText'), t('cj.schedule.remove'), t('common.cancel'), () => {
      void del.run(o.id).then(async () => {
        await off.reload();
        onChange();
      });
    });

  const describe = (o: TimeOff) => {
    if (o.kind === 'blocked') return `${formatDay(o.startsAt)} · ${formatTime(o.startsAt)}–${formatTime(o.endsAt)}`;
    const last = new Date(new Date(o.endsAt).getTime() - 60_000).toISOString();
    return formatDate(o.startsAt) === formatDate(last) ? formatDay(o.startsAt) : `${formatDay(o.startsAt)} – ${formatDay(last)}`;
  };

  return (
    <View style={styles.section}>
      <SectionHeader title={t('cj.schedule.timeOff')} subtitle={t('cj.schedule.timeOffHint')} />
      <View style={styles.wrap}>
        <AppButton title={t('cj.schedule.quickToday')} icon="today-outline" variant="outline" size="sm" onPress={() => quick(0)} />
        <AppButton title={t('cj.schedule.quickTomorrow')} variant="outline" size="sm" onPress={() => quick(1)} />
        <AppButton title={t('cj.schedule.addVacation')} icon="airplane-outline" variant="outline" size="sm" onPress={() => openSheet('vacation')} />
        <AppButton title={t('cj.schedule.addBlocked')} icon="remove-circle-outline" variant="outline" size="sm" onPress={() => openSheet('blocked')} />
      </View>
      {msg && <AppText color="success">✓ {msg}</AppText>}
      {del.error && <ErrorState compact message={del.error} />}
      {off.data && off.data.length === 0 && <AppText variant="caption" color="textMuted">{t('cj.schedule.noTimeOff')}</AppText>}
      {(off.data ?? []).map((o) => (
        <AppCard key={o.id} style={styles.offRow}>
          <Ionicons name={o.kind === 'vacation' ? 'airplane-outline' : o.kind === 'blocked' ? 'remove-circle-outline' : 'moon-outline'} size={20} color={colors.warning} />
          <View style={styles.flex}>
            <AppText variant="subheading">{t(`cj.schedule.off.${o.kind}`)}</AppText>
            <AppText variant="caption" color="textMuted">{describe(o)}{o.note ? ` · ${o.note}` : ''}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('cj.schedule.remove')} onPress={() => remove(o)} style={styles.trash}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </AppCard>
      ))}

      {open && (
        <CareSheet title={t('cj.schedule.addTitle')} onClose={() => setOpen(false)}>
          <SegmentedControl options={KINDS} value={kind} onChange={(k) => { setKind(k); if (k === 'blocked') setTo(null); }} getLabel={(v) => t(`cj.schedule.off.${v}`)} />
          <AppText variant="caption" color="textMuted">{t(kind === 'blocked' ? 'cj.schedule.pickOneDay' : 'cj.schedule.pickRange')}</AppText>
          <RangeCalendar start={from} end={to} single={kind === 'blocked'} onChange={(s, e) => { setFrom(s); setTo(e); }} />
          {kind === 'blocked' && (
            <View style={styles.row}>
              <TimeField label={t('cj.schedule.start')} value={fromTime} max={toTime} onChange={setFromTime} />
              <TimeField label={t('cj.schedule.end')} value={toTime} min={fromTime} onChange={setToTime} />
            </View>
          )}
          {from && (
            <AppText variant="subheading">
              {kind === 'blocked'
                ? `${formatDay(dayStartIso(from))} · ${fromTime}–${toTime}`
                : `${formatDay(dayStartIso(from))}${to ? ` – ${formatDay(dayStartIso(to))}` : ''} · ${t('cj.schedule.days', { count: nDays })}`}
            </AppText>
          )}
          <AppInput label={t('cj.schedule.note')} value={note} onChangeText={setNote} maxLength={200} />
          {add.error && <ErrorState compact message={add.error} />}
          <AppButton title={t('cj.schedule.addOff')} icon="checkmark-outline" fullWidth disabled={!from} loading={add.isLoading} onPress={() => void submit()} />
          <AppText variant="caption" color="textMuted">{t('cj.schedule.offSafe')}</AppText>
        </CareSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trash: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
