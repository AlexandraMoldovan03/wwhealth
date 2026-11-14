import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, EmptyState } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { EmergencyAccessEvent } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const ICONS = { created: 'qr-code-outline', revoked: 'close-circle-outline', viewed: 'eye-outline', denied: 'shield-outline' } as const;

/**
 * Emergency access log as a vertical timeline.
 * patient: who opened (or tried to open) my passport · doctor: my own scans (no patient identity).
 */
export function EmergencyAuditList({
  events,
  perspective = 'patient',
}: {
  events: EmergencyAccessEvent[];
  perspective?: 'patient' | 'doctor';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tint = { created: colors.textMuted, revoked: colors.textMuted, viewed: colors.success, denied: colors.danger };

  if (events.length === 0) {
    return (
      <EmptyState
        icon="shield-checkmark-outline"
        title={t(perspective === 'doctor' ? 'emergency.audit.doctorEmpty' : 'emergency.audit.empty')}
        message={t(perspective === 'doctor' ? 'emergency.audit.doctorEmptyHint' : 'emergency.audit.emptyHint')}
      />
    );
  }
  return (
    <AppCard style={styles.list}>
      {events.map((e, i) => {
        const text =
          perspective === 'doctor'
            ? t(`emergency.audit.doctor.${e.event}`)
            : t(`emergency.audit.${e.event}`, { name: e.actorName || t('emergency.audit.unknownDoctor') });
        return (
          <View key={e.id} style={styles.row} accessible accessibilityLabel={`${text}, ${formatDateTime(e.createdAt)}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: `${tint[e.event]}22` }]}>
                <Ionicons name={ICONS[e.event]} size={16} color={tint[e.event]} />
              </View>
              {i < events.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={styles.flex}>
              <AppText variant="subheading">
                {text}
                {e.reason ? <AppText color="textMuted"> · {t(`emergency.audit.reasons.${e.reason}`)}</AppText> : null}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {formatDateTime(e.createdAt)}
              </AppText>
            </View>
          </View>
        );
      })}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 34 },
  dot: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 14, marginVertical: 2, borderRadius: 1 },
  flex: { flex: 1, gap: spacing.xxs, paddingBottom: spacing.md, paddingTop: 6 },
});
