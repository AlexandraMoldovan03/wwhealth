import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, InfoRow } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { DocumentExtraction } from '@/types';

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
  return (
    <AppCard style={styles.card}>
      <AppText variant="label" color="textMuted">
        Extracted data
      </AppText>
      <AppText variant="caption">{extraction.summary}</AppText>
      <Line label="Diagnoses" items={extraction.diagnoses} />
      <Line label="Allergies" items={extraction.allergies} />
      <Line label="Medications" items={extraction.medications} />
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
