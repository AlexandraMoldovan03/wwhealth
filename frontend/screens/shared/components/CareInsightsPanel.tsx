import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ErrorState } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useSubmit } from '@/hooks/useSubmit';
import { EmergencyGuidanceCard } from '@/screens/patient/smart-care/components/EmergencyGuidanceCard';
import type { CareInsights, InsightStatement } from '@/types';

/**
 * AI organisation of the authorised record — runs only when asked (explicit tap) and only with the patient's AI
 * consent (checked in the backend). Every statement shows its sources; nothing here is a diagnosis or advice.
 */
export function CareInsightsPanel({ perspective, fetch, onConsent }: {
  perspective: 'patient' | 'doctor';
  fetch: () => Promise<CareInsights>;
  onConsent?: () => void;
}) {
  const { t } = useTranslation();
  const run = useSubmit(fetch);
  const d = run.data;
  const label = (id: string) => d?.sources.find((s) => s.id === id)?.label ?? id;
  return (
    <AppCard style={styles.card}>
      <AppText variant="subheading">{t('cj.ai.title')}</AppText>
      <AppText variant="caption" color="textMuted">{t('cj.ai.disclaimer')}</AppText>
      {run.error && <ErrorState compact message={run.error} />}
      {!d && <AppButton title={t('cj.ai.generate')} icon="sparkles-outline" size="sm" loading={run.isLoading} onPress={() => void run.run()} />}
      {d?.emergency && <EmergencyGuidanceCard guidance={d.emergency} />}
      {d && d.status !== 'ok' && d.status !== 'emergency' && (
        <>
          <AppText color="textMuted">{t(`cj.ai.status.${d.status}`)}</AppText>
          {d.status === 'no_consent' && perspective === 'patient' && onConsent && (
            <AppButton title={t('cj.ai.consentCta')} variant="outline" size="sm" onPress={onConsent} />
          )}
        </>
      )}
      {d?.status === 'ok' && (
        <>
          {d.insufficientSources && <AppText color="warning">{t('cj.ai.insufficient')}</AppText>}
          <Statement label={label} sourcesText={t('cj.ai.sources')} s={d.consultationSummary} title={t('cj.ai.consultation')} />
          <Statement label={label} sourcesText={t('cj.ai.sources')} s={perspective === 'patient' ? d.patientSummary : d.clinicalSummary} title={t(perspective === 'patient' ? 'cj.ai.patient' : 'cj.ai.clinical')} />
          <Statement label={label} sourcesText={t('cj.ai.sources')} s={d.generalSummary} title={t('cj.ai.general')} />
          {d.contradictions.length > 0 && (
            <View style={styles.block}>
              <AppText variant="label" color="textMuted">{t('cj.ai.contradictions')}</AppText>
              {d.contradictions.map((c, i) => <AppText key={i} variant="caption">• {c.text} ({c.sourceIds.map(label).join(', ')})</AppText>)}
            </View>
          )}
          {d.missingInformation.length > 0 && (
            <View style={styles.block}>
              <AppText variant="label" color="textMuted">{t('cj.ai.missing')}</AppText>
              {d.missingInformation.map((m, i) => <AppText key={i} variant="caption">• {m}</AppText>)}
            </View>
          )}
          {d.terms.length > 0 && (
            <View style={styles.block}>
              <AppText variant="label" color="textMuted">{t('cj.ai.terms')}</AppText>
              {d.terms.map((x) => <AppText key={x.term} variant="caption"><AppText variant="caption" style={styles.bold}>{x.term}</AppText> — {x.explanation}</AppText>)}
            </View>
          )}
          {d.discardedStatements > 0 && <AppText variant="caption" color="textMuted">{t('cj.ai.discarded', { count: d.discardedStatements })}</AppText>}
        </>
      )}
    </AppCard>
  );
}

function Statement({ s, title, label, sourcesText }: { s: InsightStatement | null; title: string; label: (id: string) => string; sourcesText: string }) {
  if (!s) return null;
  return (
    <View style={styles.block}>
      <AppText variant="label" color="textMuted">{title}</AppText>
      <AppText>{s.text}</AppText>
      <AppText variant="caption" color="textMuted">{sourcesText}: {s.sourceIds.map(label).join(', ')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  block: { gap: spacing.xxs },
  bold: { fontWeight: '700' },
});
