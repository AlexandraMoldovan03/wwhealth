import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, EmptyState, ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { LabFlagBadge } from '@/screens/patient/lab-results/components/LabFlagBadge';
import { LabTrendChart } from '@/screens/patient/lab-results/components/LabTrendChart';
import { LabTrendsList } from '@/screens/patient/lab-results/components/LabTrendsList';
import { buildLabSeries } from '@/screens/patient/lab-results/labUtils';
import type { PatientLabValue } from '@/types';
import { formatDate } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import { PatientGate } from './components/PatientGate';

function LabHistory({ labs }: { labs: PatientLabValue[] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const series = useMemo(() => buildLabSeries(labs), [labs]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = series.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      {selected && (
        <View style={styles.section}>
          <SectionHeader title={selected.name} subtitle={selected.unit ? t('labs.unitLabel', { unit: selected.unit }) : t('labs.noUnit')} />
          <AppCard style={styles.section}>
            {selected.points.some((p) => p.numeric !== null) ? <LabTrendChart series={selected} /> : <AppText color="textMuted">{t('labs.notNumeric')}</AppText>}
            <AppText variant="caption" color="textMuted">
              {t('labs.chartNote')}
            </AppText>
          </AppCard>
          {[...selected.points].reverse().map((p, i) => (
            <ListRow
              key={`${p.documentId}-${i}`}
              icon="document-text-outline"
              iconColor={colors.info}
              title={`${p.value}${selected.unit ? ` ${selected.unit}` : ''}`}
              subtitle={[p.date ? formatDate(p.date) : t('labs.noDate'), p.documentTitle].filter(Boolean).join(' · ')}
              right={<LabFlagBadge value={p.value} range={p.referenceRange} />}
            />
          ))}
        </View>
      )}
      <SectionHeader title={t('consent.doctor.allAnalyses')} />
      <LabTrendsList series={series} onSelect={(s) => setSelectedId(s.id)} />
      <AppText variant="caption" color="textSubtle">
        {t('labs.disclaimer')}
      </AppText>
    </>
  );
}

/** Lab history the patient shared (section 'labs'), grouped per analysis + unit — units are never mixed. */
export function PatientLabsScreen() {
  const { t } = useTranslation();
  return (
    <PatientGate>
      {(view) =>
        view.labs === null ? (
          <EmptyState icon="lock-closed-outline" title={t('consent.summary.notShared')} message={t('consent.doctor.labsNotShared')} />
        ) : (
          <LabHistory labs={view.labs} />
        )
      }
    </PatientGate>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
