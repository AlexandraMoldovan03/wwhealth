import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, SectionHeader } from '@/design-system';
import { PrioritizedPassportView } from '@/screens/shared/components/PrioritizedPassportView';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { EmergencyData } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

/** Doctor view: blood type, allergies, active conditions, active medication — nothing else. */
export function EmergencyDataView({ data }: { data: EmergencyData }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;

  if (data.passport) {
    return (
      <View style={styles.wrap}>
        <PrioritizedPassportView passport={data.passport} />
        <AppText variant="caption" color="textMuted" align="center">
          {t('emergency.accessedAt', { date: formatDateTime(data.accessedAt) })}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <AppCard style={styles.blood}>
        <AppText variant="label" color="textMuted">
          {t('emergency.bloodType')}
        </AppText>
        <AppText variant="display" color="danger">
          {data.bloodType ?? '—'}
        </AppText>
      </AppCard>

      <Section title={t('emergency.allergies')} empty={data.allergies.length === 0}>
        {data.allergies.map((a, i) => (
          <View key={`${a.substance}-${i}`} style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="subheading">{a.substance}</AppText>
              {!!a.reaction && <AppText color="textMuted">{a.reaction}</AppText>}
            </View>
            {a.severity && <Badge label={t(`enums.severity.${a.severity}`, { defaultValue: a.severity })} color={severityColor[a.severity]} />}
          </View>
        ))}
      </Section>

      <Section title={t('emergency.conditions')} empty={data.conditions.length === 0}>
        {data.conditions.map((c, i) => (
          <AppText key={`${c.name}-${i}`} variant="subheading">
            {c.name}
            {c.icd10 ? <AppText color="textMuted"> · {c.icd10}</AppText> : null}
          </AppText>
        ))}
      </Section>

      <Section title={t('emergency.medications')} empty={data.medications.length === 0}>
        {data.medications.map((m, i) => (
          <View key={`${m.name}-${i}`}>
            <AppText variant="subheading">{m.name}</AppText>
            {!!(m.dosage || m.frequency) && (
              <AppText color="textMuted">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</AppText>
            )}
          </View>
        ))}
      </Section>

      <AppText variant="caption" color="textMuted" align="center">
        {t('emergency.accessedAt', { date: formatDateTime(data.accessedAt) })}
      </AppText>
    </View>
  );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <AppCard style={styles.list}>{empty ? <AppText color="textMuted">{t('emergency.noneRecorded')}</AppText> : children}</AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  blood: { alignItems: 'center', gap: spacing.xs },
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
});
