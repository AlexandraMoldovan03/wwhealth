import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppCard, AppText, Badge, EmptyState, enterUp } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { currentLocale } from '@/i18n';
import type { MedicalEvent, MedicalEventType } from '@/types';
import { formatDateTime } from '@/utils/format';

import { getEventStyle } from './eventStyle';
import { useTranslation } from 'react-i18next';

/** Where an entry comes from (real data only: uploads, the medical profile, saved AI results). */
const SOURCE_KEY: Record<MedicalEventType, string> = {
  document: 'history.source.upload',
  xray: 'history.source.lungvision',
  diagnosis: 'history.source.profile',
  treatment: 'history.source.profile',
  allergy: 'history.source.profile',
  visit: 'history.source.visit',
  lab: 'history.source.scanner',
};

const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
};

/**
 * Chronological medical timeline (newest first), grouped by month.
 * Each entry: date, category, title, source. Used by the patient (tab, dashboard) and the doctor summary.
 */
export function MedicalEventList({
  events,
  onSelect,
  grouped = false,
  emptyAction,
}: {
  events: MedicalEvent[];
  onSelect?: (e: MedicalEvent) => void;
  grouped?: boolean;
  /** CTA in the empty state (patient screens only). */
  emptyAction?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (events.length === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title={t('history.empty')}
        message={t('history.emptyHint')}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onPress}
      />
    );
  }

  const months = events.map((e) => monthLabel(e.date));
  return (
    <View style={styles.list}>
      {events.map((event, i) => {
        const style = getEventStyle(event.type, colors);
        const month = months[i];
        const showMonth = grouped && (i === 0 || months[i - 1] !== month);
        const category = t(`history.types.${event.type}`);
        const source = t(SOURCE_KEY[event.type]);
        return (
          <View key={event.id} style={styles.item}>
            {showMonth && (
              <Animated.View entering={enterUp(i)}>
                <AppText variant="label" color="textMuted" style={styles.month}>
                  {month}
                </AppText>
              </Animated.View>
            )}
            <AppCard
              enterIndex={i}
              onPress={onSelect ? () => onSelect(event) : undefined}
              accessibilityLabel={`${category}: ${event.title}, ${formatDateTime(event.date)}, ${source}`}
            >
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: `${style.color}1F` }]}>
                  <Ionicons name={style.icon} size={20} color={style.color} />
                </View>
                <View style={styles.text}>
                  <AppText variant="subheading" numberOfLines={2}>
                    {event.title}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {formatDateTime(event.date)} · {source}
                  </AppText>
                </View>
                <View style={styles.right}>
                  <Badge label={category} color={style.color} />
                  {event.documentId && <Ionicons name="document-attach-outline" size={16} color={colors.textSubtle} />}
                </View>
              </View>
            </AppCard>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: { gap: spacing.sm },
  month: { marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: spacing.xxs },
  right: { alignItems: 'flex-end', gap: spacing.xs },
});
