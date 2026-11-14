import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { currentLocale } from '@/i18n';
import { CareSheet } from '@/screens/patient/smart-care/components/CareSheet';

// ───────── time: tap a field → pick from a grid (no typing, no invalid values)

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06 … 22
const pad = (n: number) => String(n).padStart(2, '0');

export function TimeField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
        <AppText variant="caption" color="textMuted">{label}</AppText>
        <View style={styles.fieldRow}>
          <AppText variant="heading">{value}</AppText>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
        </View>
      </Pressable>
      {open && (
        <CareSheet title={label} onClose={() => setOpen(false)}>
          {HOURS.map((h) => (
            <View key={h} style={styles.hourRow}>
              {[0, 15, 30, 45].map((m) => {
                const v = `${pad(h)}:${pad(m)}`;
                const disabled = (!!min && v <= min) || (!!max && v >= max);
                const selected = v === value;
                return (
                  <Pressable key={v} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }}
                    onPress={() => { onChange(v); setOpen(false); }}
                    style={[styles.timeChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }, disabled && styles.disabled]}>
                    <AppText variant="caption" color={selected ? 'onPrimary' : 'text'}>{v}</AppText>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </CareSheet>
      )}
    </>
  );
}

// ───────── dates: month calendar, tap start then end (a single tap = one day)

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => new Date(`${s}T12:00:00`);

export function RangeCalendar({ start, end, onChange, single = false }: {
  start: string | null; end: string | null; onChange: (start: string | null, end: string | null) => void; single?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => {
    const d = start ? fromYmd(start) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  }, [month]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i + 1).toLocaleDateString(currentLocale(), { weekday: 'narrow' })), []);
  const tap = (d: string) => {
    if (single || !start || end || d < start) onChange(d, null);
    else onChange(start, d === start ? null : d);
  };
  const last = end ?? start;
  const canGoBack = month > new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  return (
    <View style={styles.cal}>
      <View style={styles.calHead}>
        <AppButton title="‹" variant="ghost" size="sm" disabled={!canGoBack} accessibilityLabel={t('cj.agenda.prev')} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} />
        <AppText variant="subheading" align="center" style={styles.flex}>{month.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' })}</AppText>
        <AppButton title="›" variant="ghost" size="sm" accessibilityLabel={t('cj.agenda.next')} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} />
      </View>
      <View style={styles.grid}>
        {weekdays.map((w, i) => <AppText key={i} variant="caption" color="textMuted" align="center" style={styles.cell}>{w}</AppText>)}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const past = d < today;
          const edge = d === start || d === last;
          const inside = !!start && !!last && d > start && d < last;
          return (
            <Pressable key={d} disabled={past} onPress={() => tap(d)} accessibilityRole="button" accessibilityState={{ selected: edge || inside, disabled: past }}
              accessibilityLabel={fromYmd(d).toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })} style={styles.cell}>
              <View style={[styles.day, inside && { backgroundColor: colors.primaryMuted }, edge && { backgroundColor: colors.primary }, d === today && !edge && { borderWidth: 1, borderColor: colors.primary }]}>
                <AppText variant="caption" color={edge ? 'onPrimary' : past ? 'textSubtle' : 'text'}>{Number(d.slice(8))}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ───────── weekday chips (L Ma Mi J V S D)

export function WeekdayChips({ value, onToggle }: { value: number[]; onToggle: (weekday: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips}>
      {[1, 2, 3, 4, 5, 6, 7].map((w) => {
        const on = value.includes(w);
        const name = new Date(2024, 0, w).toLocaleDateString(currentLocale(), { weekday: 'short' });
        return (
          <Pressable key={w} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            accessibilityLabel={new Date(2024, 0, w).toLocaleDateString(currentLocale(), { weekday: 'long' })} onPress={() => onToggle(w)}
            style={[styles.dayChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
            <AppText variant="caption" color={on ? 'onPrimary' : 'text'}>{name.replace('.', '')}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xxs, minHeight: 56 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.8 },
  hourRow: { flexDirection: 'row', gap: spacing.xs },
  timeChip: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1 },
  disabled: { opacity: 0.3 },
  cal: { gap: spacing.xs },
  calHead: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dayChip: { minWidth: 44, minHeight: 40, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
});
