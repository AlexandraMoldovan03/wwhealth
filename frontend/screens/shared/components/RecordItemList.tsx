import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName, OrganizedRecord, RecordCategory, RecordItem, Verification } from '@/types';
import { formatDate } from '@/utils/format';

const ICON: Record<RecordCategory, IconName> = {
  allergies: 'warning-outline', medication: 'medkit-outline', conditions: 'pulse-outline', procedures: 'cut-outline',
  labs: 'flask-outline', investigations: 'scan-outline', consultations: 'calendar-outline', hospitalizations: 'bed-outline',
  vaccinations: 'shield-checkmark-outline', family_history: 'people-outline',
};

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
      {!!item.detail && <AppText variant="caption">{item.detail}</AppText>}
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
  const open = (i: RecordItem) => (onOpen && (i.documentId || i.planId) ? () => onOpen(i) : undefined);
  if (record.view === 'category') {
    return (
      <View style={styles.list}>
        {record.sections.map((s) => (
          <View key={s.category} style={styles.list}>
            <AppText variant="label" color="textMuted">{t(`cj.record.category.${s.category}`)} · {s.items.length}</AppText>
            {s.items.map((i) => <RecordItemCard key={i.id} item={i} onPress={open(i)} />)}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {record.view === 'relevance' && record.insufficient && (
        <AppText variant="caption" color="textMuted">{t('cj.record.insufficient')}</AppText>
      )}
      {record.items.map((i) => <RecordItemCard key={i.id} item={i} onPress={open(i)} showWhy={record.view === 'relevance'} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
});
