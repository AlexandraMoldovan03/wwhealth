import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { TreatmentPlan, TreatmentStatus, TreatmentVersion } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

export function useTreatmentTone() {
  const { colors } = useTheme();
  return (s: TreatmentStatus) =>
    ({ UPCOMING: colors.info, ACTIVE: colors.success, COMPLETED: colors.textMuted, DISCONTINUED: colors.warning, CANCELLED: colors.danger })[s];
}

/** "1 comprimat · oral · 08:00, 20:00" — only documented fields, nothing derived. */
export function useDoseLine() {
  const { t } = useTranslation();
  return (v: TreatmentVersion) => {
    const dose = [v.doseAmount ?? '', v.doseUnit ?? ''].join(' ').trim();
    const when = v.scheduleType === 'fixed_times' ? v.timesOfDay.join(', ') : t(`cj.treat.schedule.${v.scheduleType}`);
    return [dose, v.route, v.frequencyText, when].filter(Boolean).join(' · ');
  };
}

/** One WWHealth treatment plan. Prescription vs. instructions are always labelled; never an official CNAS e-prescription. */
export function TreatmentCard({ plan, onPress, children, enterIndex }: { plan: TreatmentPlan; onPress?: () => void; children?: ReactNode; enterIndex?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tone = useTreatmentTone();
  const doseLine = useDoseLine();
  const v = plan.current;
  return (
    <AppCard style={styles.card} onPress={onPress} enterIndex={enterIndex}>
      <View style={styles.row}>
        <Ionicons name={plan.kind === 'prescription' ? 'document-text-outline' : 'clipboard-outline'} size={18} color={colors.primary} />
        <View style={styles.flex}>
          <AppText variant="subheading">{[v.medicationName, v.strength].filter(Boolean).join(' ')}</AppText>
          {!!(v.activeSubstance || v.dosageForm) && (
            <AppText variant="caption" color="textMuted">{[v.activeSubstance, v.dosageForm].filter(Boolean).join(' · ')}</AppText>
          )}
        </View>
        <Badge label={t(`cj.treat.status.${plan.status}`)} color={tone(plan.status)} />
      </View>
      <AppText>{doseLine(v)}</AppText>
      <AppText variant="caption" color="textMuted">
        {t(`cj.treat.kind.${plan.kind}`)} · {plan.prescriberName} · {formatDate(v.startDate)}
        {v.endDate ? ` → ${formatDate(v.endDate)}` : ''}
      </AppText>
      {children}
    </AppCard>
  );
}

/** Immutable version history: who changed what and when. */
export function TreatmentHistory({ plan }: { plan: TreatmentPlan }) {
  const { t } = useTranslation();
  const doseLine = useDoseLine();
  return (
    <View style={styles.history}>
      {plan.history.map((h) => (
        <View key={h.version} style={styles.version}>
          <AppText variant="label" color="textMuted">
            v{h.version} · {t(`cj.treat.change.${h.changeKind}`)} · {formatDateTime(h.changedAt)}
          </AppText>
          <AppText variant="caption">{h.changedByName}</AppText>
          <AppText variant="caption" color="textMuted">{[h.medicationName, h.strength].filter(Boolean).join(' ')} · {doseLine(h)}</AppText>
          {!!h.changeReason && <AppText variant="caption">{t('cj.treat.reason')}: {h.changeReason}</AppText>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  history: { gap: spacing.md },
  version: { gap: spacing.xxs },
});
