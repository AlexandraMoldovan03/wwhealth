import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { downloadAndShare, type ExportKind } from '@/services/exportFile';
import type { IconName } from '@/types';
import { getErrorMessage } from '@/utils/errors';

const ROWS: { kind: ExportKind; icon: IconName }[] = [
  { kind: 'fhir', icon: 'code-slash-outline' },
  { kind: 'emergency-summary', icon: 'medkit-outline' },
  { kind: 'summary.pdf', icon: 'document-text-outline' },
  { kind: 'labs.csv', icon: 'grid-outline' },
  { kind: 'archive.zip', icon: 'archive-outline' },
];

/** FHIR R4 / emergency summary / PDF / CSV / ZIP. `patientId` → doctor export (only the sections the patient shared). */
export function ExportPanel({ patientId }: { patientId?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: ExportKind) => {
    setBusy(kind);
    setError(null);
    try {
      await downloadAndShare(kind, patientId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title={t('exports.title')} subtitle={t(patientId ? 'exports.doctorSubtitle' : 'exports.subtitle')} />
      {ROWS.map((row, index) => (
        <ListRow
          key={row.kind}
          icon={row.icon}
          iconColor={colors.primary}
          title={t(`exports.kinds.${row.kind}.title`)}
          subtitle={t(`exports.kinds.${row.kind}.hint`)}
          enterIndex={index}
          right={busy === row.kind ? <ActivityIndicator color={colors.primary} /> : undefined}
          onPress={busy ? undefined : () => void run(row.kind)}
        />
      ))}
      {error && <AppText variant="caption" color="danger">{error}</AppText>}
      <AppText variant="caption" color="textMuted">{t('exports.note')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.sm } });
