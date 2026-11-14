import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { Appointment, AppointmentStatus } from '@/types';
import { formatDay, formatTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** One appointment (patient or doctor view). Actions go in `children`. */
export function AppointmentCard({
  appointment: a,
  perspective,
  children,
  enterIndex,
}: {
  appointment: Appointment;
  perspective: 'patient' | 'doctor';
  children?: ReactNode;
  enterIndex?: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tone: Record<AppointmentStatus, string> = {
    requested: colors.warning,
    proposed: colors.info,
    confirmed: colors.success,
    rejected: colors.danger,
    cancelled: colors.textMuted,
  };
  const who = perspective === 'patient' ? a.doctorName : a.patientName;
  const when = (start: string, end: string) => `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`;

  return (
    <AppCard style={styles.card} enterIndex={enterIndex}>
      <View style={styles.row}>
        <Ionicons name={perspective === 'patient' ? 'medkit-outline' : 'person-outline'} size={18} color={colors.primary} />
        <View style={styles.flex}>
          <AppText variant="subheading">{who ?? t(perspective === 'patient' ? 'care.appointments.doctor' : 'care.appointments.patient')}</AppText>
          {!!a.specialtyName && (
            <AppText variant="caption" color="textMuted">
              {a.specialtyName}
            </AppText>
          )}
        </View>
        <Badge label={t(`care.status.${a.status}`)} color={tone[a.status]} />
      </View>
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <AppText style={[styles.flex, a.status === 'proposed' && styles.strike]}>{when(a.startsAt, a.endsAt)}</AppText>
      </View>
      {a.status === 'proposed' && a.proposedStartsAt && a.proposedEndsAt && (
        <View style={styles.row}>
          <Ionicons name="swap-horizontal-outline" size={16} color={colors.info} />
          <AppText style={styles.flex}>
            {t('care.appointments.proposedTime')}: {when(a.proposedStartsAt, a.proposedEndsAt)}
          </AppText>
        </View>
      )}
      {!!a.patientNote && (
        <AppText variant="caption" color="textMuted">
          {t('care.appointments.patientNote')}: {a.patientNote}
        </AppText>
      )}
      {!!a.doctorNote && (
        <AppText variant="caption" color="textMuted">
          {t('care.appointments.doctorNote')}: {a.doctorNote}
        </AppText>
      )}
      {children}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  strike: { textDecorationLine: 'line-through', opacity: 0.6 },
});
