import { StyleSheet, View } from 'react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText, Badge, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { ItemRow } from '@/screens/shared/components/PrioritizedPassportView';
import { api } from '@/services/backend';
import type { DocumentSummary, PassportItem } from '@/types';
import { formatDate } from '@/utils/format';

/** Structured summary of one document: short conclusion, then only the sections that have data. */
export function DocumentSummaryCard({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const load = useCallback(() => api.getDocumentSummary(documentId), [documentId]);
  const { data } = useAsync(load);
  if (!data) return null;
  const empty = !data.findings.length && !data.abnormalLabs.length && !data.diagnoses.length && !data.treatment.length;
  if (empty && data.normalLabsCount === 0) return null;

  return (
    <View style={styles.wrap}>
      <Conclusion summary={data} />
      <Section title={t('docSummary.emergency')} items={data.emergencyRelevant} />
      <Section title={t('docSummary.abnormal')} items={data.abnormalLabs} />
      <Section title={t('docSummary.diagnoses')} items={data.diagnoses} />
      <Section title={t('docSummary.findings')} items={data.findings} />
      <Section title={t('docSummary.treatment')} items={data.treatment} />
    </View>
  );
}

function Conclusion({ summary }: { summary: DocumentSummary }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const critical = summary.abnormalLabs.filter((l) => l.lab?.critical).length;
  const main = summary.diagnoses.filter((d) => d.kind === 'condition' && d.confirmed).slice(0, 2).map((d) => d.label);
  const parts = [
    summary.abnormalLabs.length ? t('docSummary.abnormalCount', { count: summary.abnormalLabs.length }) : null,
    critical ? t('docSummary.criticalCount', { count: critical }) : null,
    main.length ? t('docSummary.mainDiagnosis', { names: main.join(', ') }) : null,
  ].filter(Boolean);
  return (
    <AppCard style={styles.card}>
      <AppText variant="label" color="textMuted">
        {[t(`documentTypes.${summary.documentType}`, { defaultValue: summary.documentType }), summary.date ? formatDate(summary.date) : null]
          .filter(Boolean).join(' · ')}
      </AppText>
      <AppText variant="subheading">{parts.length ? `${parts.join('; ')}.` : t('docSummary.noFindings')}</AppText>
      <View style={styles.badges}>
        {summary.normalLabsCount > 0 && <Badge label={t('docSummary.normalCount', { count: summary.normalLabsCount })} color={colors.success} />}
        {summary.needsConfirmation > 0 && (
          <Badge label={t('docSummary.toConfirm', { count: summary.needsConfirmation })} color={colors.warning} />
        )}
      </View>
    </AppCard>
  );
}

function Section({ title, items }: { title: string; items: PassportItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <AppCard style={styles.card}>
        {items.map((item) => <ItemRow key={item.key} item={item} />)}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { gap: spacing.xs },
  card: { gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
