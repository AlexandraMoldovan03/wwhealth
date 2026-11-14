import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, InfoRow, ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { LabFlagBadge } from '@/screens/patient/lab-results/components/LabFlagBadge';
import type { MedicalDocument, MedicalSummary } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import { getDocumentMeta } from './documentMeta';

/**
 * Structured medical summary — patient preview and doctor view.
 * Only stored values, copied as they are (no AI, no interpretation). A section the patient did not share
 * is `null` and says so; an empty shared section says "none recorded".
 */
export function MedicalSummaryView({ summary, onOpenDocument }: { summary: MedicalSummary; onOpenDocument?: (doc: MedicalDocument) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;
  const notShared = <AppText color="textMuted">{t('consent.summary.notShared')}</AppText>;
  const none = <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>;
  const b = summary.basics;

  return (
    <>
      <View style={styles.section}>
        <SectionHeader title={t('consent.summary.basics')} />
        <AppCard enterIndex={0}>
          {b ? (
            <>
              <InfoRow first label={t('consent.summary.dateOfBirth')} value={b.dateOfBirth ?? '—'} />
              <InfoRow label={t('profile.sex')} value={b.sex ? t(`enums.sex.${b.sex}`) : '—'} />
              <InfoRow label={t('profile.bloodType')} value={b.bloodType ?? '—'} />
              <InfoRow label={t('profile.heightWeight')} value={`${b.heightCm ?? '—'} cm · ${b.weightKg ?? '—'} kg`} />
            </>
          ) : (
            notShared
          )}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('profile.allergies')} />
        <AppCard style={styles.list} enterIndex={1}>
          {summary.allergies === null
            ? notShared
            : summary.allergies.length === 0
              ? none
              : summary.allergies.map((a) => (
                  <View key={a.id} style={styles.item}>
                    <View style={styles.itemText}>
                      <AppText variant="subheading">{a.substance}</AppText>
                      {!!a.reaction && <AppText variant="caption" color="textMuted">{a.reaction}</AppText>}
                    </View>
                    <Badge label={t(`enums.severity.${a.severity}`)} color={severityColor[a.severity]} />
                  </View>
                ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.summary.conditions')} />
        <AppCard style={styles.list} enterIndex={2}>
          {summary.conditions === null
            ? notShared
            : summary.conditions.length === 0
              ? none
              : summary.conditions.map((d) => (
                  <View key={d.id} style={styles.itemText}>
                    <AppText variant="subheading">{d.name}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {d.icd10 ? `${d.icd10} · ` : ''}
                      {t('profile.since', { date: d.diagnosedAt })}
                    </AppText>
                  </View>
                ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.summary.medication')} />
        <AppCard style={styles.list} enterIndex={3}>
          {summary.medications === null
            ? notShared
            : summary.medications.length === 0
              ? none
              : summary.medications.map((m) => (
                  <View key={m.id} style={styles.itemText}>
                    <AppText variant="subheading">{m.name}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {[m.dosage, m.frequency].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.summary.labs')} subtitle={t('consent.summary.labsHint')} />
        <AppCard style={styles.list} enterIndex={4}>
          {summary.latestLabs === null
            ? notShared
            : summary.latestLabs.length === 0
              ? <AppText color="textMuted">{t('consent.summary.noLabs')}</AppText>
              : summary.latestLabs.map((lab) => (
                  <View key={`${lab.name}|${lab.unit ?? ''}`} style={styles.item}>
                    <View style={styles.itemText}>
                      <AppText variant="subheading">{lab.name}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {[lab.date ? formatDate(lab.date) : t('labs.noDate'), lab.referenceRange ? t('consent.summary.range', { range: lab.referenceRange }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    </View>
                    <View style={styles.value}>
                      <AppText variant="subheading">
                        {lab.value}
                        {lab.unit ? <AppText variant="caption" color="textMuted">{` ${lab.unit}`}</AppText> : null}
                      </AppText>
                      <LabFlagBadge value={lab.value} range={lab.referenceRange} />
                    </View>
                  </View>
                ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('consent.summary.documents')} />
        {summary.documents === null ? (
          <AppCard>{notShared}</AppCard>
        ) : summary.documents.length === 0 ? (
          <AppCard>{none}</AppCard>
        ) : (
          summary.documents.map((doc, i) => {
            const meta = getDocumentMeta(doc.type);
            return (
              <ListRow
                key={doc.id}
                enterIndex={5 + i}
                icon={meta.icon}
                iconColor={colors.info}
                title={doc.title}
                subtitle={`${t(`documentTypes.${meta.value}`)} · ${formatDateTime(doc.uploadedAt)}`}
                onPress={onOpenDocument ? () => onOpenDocument(doc) : undefined}
              />
            );
          })
        )}
      </View>

      <AppText variant="caption" color="textSubtle">
        {t('consent.summary.disclaimer')}
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemText: { flex: 1, gap: spacing.xxs },
  value: { alignItems: 'flex-end', gap: 2 },
});
