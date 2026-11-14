import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, SectionHeader } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName, IntelligenceCategory, IntelligenceItem, IntelligenceSource, MedicalIntelligence } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';
import { DataOriginBadge } from './DataOrigin';
import { useTranslation } from 'react-i18next';

const CATEGORY_ICON: Record<IntelligenceCategory, IconName> = {
  priority: 'alert-circle-outline',
  active: 'pulse-outline',
  history: 'time-outline',
  verify: 'help-circle-outline',
};
const SOURCE_ICON: Record<IntelligenceSource['kind'], IconName> = {
  profile: 'person-outline',
  allergy: 'warning-outline',
  condition: 'medkit-outline',
  medication: 'bandage-outline',
  surgery: 'cut-outline',
  lab: 'flask-outline',
  document: 'document-text-outline',
};

/**
 * AI Medical Intelligence — patient and doctor. Safety items first (explicit rules), every claim with its sources.
 * `onOpenDocument` opens the original document behind a source (patient or doctor route).
 */
export function IntelligenceSummaryView({ summary, onOpenDocument }: { summary: MedicalIntelligence; onOpenDocument?: (documentId: string) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sources = new Map(summary.sources.map((s) => [s.id, s]));
  const tone: Record<IntelligenceCategory, string> = { priority: colors.danger, active: colors.primary, history: colors.info, verify: colors.warning };

  const sourceChips = (ids: string[]) => {
    const refs = ids.map((id) => sources.get(id)).filter((s): s is IntelligenceSource => !!s);
    if (refs.length === 0) return null;
    return (
      <View style={styles.chips}>
        {refs.map((s) => {
          const openable = !!(s.documentId && onOpenDocument);
          return (
            <Pressable
              key={s.id}
              disabled={!openable}
              onPress={() => s.documentId && onOpenDocument?.(s.documentId)}
              accessibilityRole={openable ? 'link' : 'text'}
              accessibilityLabel={`${t(`ai.sourceKinds.${s.kind}`)}: ${s.label}`}
              style={[styles.chip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            >
              <Ionicons name={SOURCE_ICON[s.kind]} size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.chipText}>
                {s.label}
                {s.date ? ` · ${s.date.length >= 10 ? formatDate(s.date) : s.date}` : ''}
              </AppText>
              {openable && <Ionicons name="open-outline" size={12} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const itemText = (item: IntelligenceItem) => (item.code ? t(`ai.missing.${item.code}`, { name: item.text }) : item.text);

  return (
    <>
      <AppCard enterIndex={0} style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          <AppText variant="subheading" style={styles.flex}>
            {t('ai.overview')}
          </AppText>
          <Badge label="Gemini" color={colors.accent} />
        </View>
        {summary.overview ? (
          <AppText>{summary.overview}</AppText>
        ) : (
          <AppText color="textMuted">{t('ai.noOverview')}</AppText>
        )}
        {sourceChips(summary.overviewSourceIds)}
        <AppText variant="caption" color="textMuted">
          {t('ai.generatedAt', { date: formatDateTime(summary.generatedAt) })}
          {` · ${summary.sourceScopes.map((s) => t(`consent.scopes.${s}`)).join(', ')}`}
        </AppText>
      </AppCard>

      {summary.sections.map((section, si) => (
        <View key={section.category} style={styles.section}>
          <SectionHeader title={t(`ai.categories.${section.category}`)} subtitle={t(`ai.categoryHints.${section.category}`)} />
          {section.items.length === 0 ? (
            <AppCard>
              <AppText color="textMuted">{t('ai.emptyCategory')}</AppText>
            </AppCard>
          ) : (
            section.items.map((item, i) => (
              <AppCard
                key={`${section.category}-${i}`}
                enterIndex={si + 1}
                style={[styles.card, section.category === 'priority' && { borderLeftWidth: 4, borderLeftColor: tone.priority }]}
              >
                <View style={styles.row}>
                  <Ionicons name={CATEGORY_ICON[section.category]} size={18} color={tone[section.category]} />
                  <AppText style={styles.flex}>{itemText(item)}</AppText>
                </View>
                <View style={styles.badges}>
                  {item.flag && <Badge label={t(`ai.flags.${item.flag}`)} color={colors.danger} />}
                  {item.origin === 'ai' ? <DataOriginBadge origin="ai" /> : <Badge label={t('ai.origin.record')} color={colors.textMuted} />}
                </View>
                {sourceChips(item.sourceIds)}
              </AppCard>
            ))
          )}
        </View>
      ))}

      {summary.discardedStatements > 0 && (
        <AppText variant="caption" color="textMuted">
          {t('ai.discarded', { count: summary.discardedStatements })}
        </AppText>
      )}
      <AppText variant="caption" color="textSubtle">
        {t('ai.disclaimer')}
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { flexShrink: 1 },
});
