import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName, OrganizedRecord, RecordCategory, RecordItem, Verification } from '@/types';
import { formatDate } from '@/utils/format';

const ICON: Record<RecordCategory, IconName> = {
  allergies: 'warning-outline', medication: 'medkit-outline', conditions: 'pulse-outline', procedures: 'cut-outline',
  labs: 'flask-outline', investigations: 'scan-outline', consultations: 'calendar-outline', hospitalizations: 'bed-outline',
  vaccinations: 'shield-checkmark-outline', family_history: 'people-outline', recommendations: 'list-outline',
};
/** Statuses worth a visible label (imported medication is historical; suspicions are never shown as diagnoses). */
const STATUS_BADGE = new Set(['historical', 'suspected', 'history', 'ruled_out', 'stopped', 'differential']);
const OPEN_BY_DEFAULT = new Set<RecordCategory>(['allergies', 'medication', 'conditions']);

function useVerificationTone() {
  const { colors } = useTheme();
  return (v: Verification) =>
    ({ patient_declared: colors.warning, doctor_prescribed: colors.success, document: colors.info, patient_confirmed_lab: colors.info,
      ai_screening: colors.textMuted, booking: colors.textMuted })[v];
}

/** One record item with its provenance: source, date, author, verification. Declared data is never shown as validated. */
export function RecordItemCard({ item, onPress, showWhy = false }: { item: RecordItem; onPress?: () => void; showWhy?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tone = useVerificationTone();
  const date = item.date ? formatDate(item.date) : null;
  return (
    <AppCard style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Ionicons name={ICON[item.category]} size={18} color={item.category === 'allergies' ? colors.danger : colors.primary} />
        <AppText variant="subheading" style={styles.flex}>{item.title}</AppText>
        <Badge label={t(`cj.record.verification.${item.verification}`)} color={tone(item.verification)} />
      </View>
      {(item.isDemo || (!!item.status && STATUS_BADGE.has(item.status))) && (
        <View style={styles.badges}>
          {!!item.status && STATUS_BADGE.has(item.status) && <Badge label={t(`smart.itemStatus.${item.status}`)} color={colors.info} />}
          {item.isDemo && <Badge label={t('home.demoData')} color={colors.warning} />}
        </View>
      )}
      {!!item.detail && <AppText variant="caption">{item.detail}</AppText>}
      {!!item.sourceExcerpt && (
        <AppText variant="caption" color="textMuted" numberOfLines={2}>
          {`„${item.sourceExcerpt}”${item.sourcePage ? ` · ${t('smart.page', { page: item.sourcePage })}` : ''}`}
        </AppText>
      )}
      <AppText variant="caption" color="textMuted">
        {[t(`cj.record.category.${item.category}`), date, item.author, item.documentType && t(`documentTypes.${item.documentType}`, { defaultValue: item.documentType })]
          .filter(Boolean).join(' · ')}
      </AppText>
      {showWhy && !!item.relevanceReason && (
        <AppText variant="caption" color="primary">{t(`cj.record.why.${item.relevanceReason}`)}</AppText>
      )}
    </AppCard>
  );
}

/** The three views of the intelligent record. Empty categories are never rendered. */
export function OrganizedRecordView({ record, onOpen }: { record: OrganizedRecord; onOpen?: (item: RecordItem) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState<Set<RecordCategory>>(() => new Set(OPEN_BY_DEFAULT));
  const toggle = (c: RecordCategory) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });
  const press = (i: RecordItem) => (onOpen && (i.documentId || i.planId) ? () => onOpen(i) : undefined);
  if (record.view === 'category') {
    return (
      <View style={styles.list}>
        {record.sections.map((s) => {
          const expanded = open.has(s.category);
          return (
            <View key={s.category} style={styles.list}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggle(s.category)} style={styles.row}>
                <AppText variant="label" color="textMuted" style={styles.flex}>{t(`cj.record.category.${s.category}`)} · {s.items.length}</AppText>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </Pressable>
              {expanded && s.items.map((i) => <RecordItemCard key={i.id} item={i} onPress={press(i)} />)}
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {record.view === 'relevance' && record.insufficient && (
        <AppText variant="caption" color="textMuted">{t('cj.record.insufficient')}</AppText>
      )}
      {record.items.map((i) => <RecordItemCard key={i.id} item={i} onPress={press(i)} showWhy={record.view === 'relevance'} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
