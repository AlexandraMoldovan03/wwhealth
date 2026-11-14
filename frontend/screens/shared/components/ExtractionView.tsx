import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, InfoRow } from '@/design-system';
import { spacing } from '@/design-system/theme';
import type { DocumentExtraction } from '@/types';
import { useTranslation } from 'react-i18next';

function Line({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <AppText variant="caption">
      <AppText variant="caption" color="textMuted">
        {label}:{' '}
      </AppText>
      {items.join(', ')}
    </AppText>
  );
}

/** Data extracted from a document (by Gemini on the backend). */
export function ExtractionView({ extraction }: { extraction: DocumentExtraction }) {
  const { t } = useTranslation();
  return (
    <AppCard style={styles.card}>
      <AppText variant="label" color="textMuted">
        {t('documents.extracted')}
      </AppText>
      <AppText variant="caption">{extraction.summary}</AppText>
      <Line label={t('documents.diagnoses')} items={extraction.diagnoses} />
      <Line label={t('documents.allergies')} items={extraction.allergies} />
      <Line label={t('documents.medications')} items={extraction.medications} />
      {extraction.labValues.length > 0 && (
        <View>
          {extraction.labValues.map((lab, i) => (
            <InfoRow
              key={lab.name}
              first={i === 0}
              label={lab.name}
              value={`${lab.value}${lab.unit ? ` ${lab.unit}` : ''}${lab.flag && lab.flag !== 'normal' ? ` (${lab.flag})` : ''}`}
            />
          ))}
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
