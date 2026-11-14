import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, InfoRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { PatientProfile } from '@/types';
import { useTranslation } from 'react-i18next';

function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) years -= 1;
  return years;
}

/** Personal data + allergies + diagnoses + treatments. Shared by patient and doctor views. */
export function ProfileSections({ profile }: { profile: PatientProfile }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;

  return (
    <>
      <AppCard enterIndex={0}>
        <InfoRow first label={t('profile.name')} value={profile.fullName} />
        <InfoRow label={t('profile.age')} value={profile.dateOfBirth ? `${age(profile.dateOfBirth)} (${profile.dateOfBirth})` : '—'} />
        <InfoRow label={t('profile.sex')} value={profile.sex ? t(`enums.sex.${profile.sex}`) : '—'} />
        <InfoRow label={t('profile.bloodType')} value={profile.bloodType ?? '—'} />
        <InfoRow label={t('profile.heightWeight')} value={`${profile.heightCm ?? '—'} cm · ${profile.weightKg ?? '—'} kg`} />
        {profile.emergencyContact && (
          <InfoRow
            label={t('profile.emergencyContact')}
            value={`${profile.emergencyContact.name} (${profile.emergencyContact.relation}) ${profile.emergencyContact.phone}`}
          />
        )}
      </AppCard>

      <View style={styles.section}>
        <SectionHeader title={t('profile.allergies')} />
        <AppCard style={styles.list} enterIndex={1}>
          {profile.allergies.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.allergies.map((a) => (
            <View key={a.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{a.substance}</AppText>
                <AppText variant="caption" color="textMuted">
                  {a.reaction}
                </AppText>
              </View>
              <Badge label={t(`enums.severity.${a.severity}`)} color={severityColor[a.severity]} />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('profile.diagnoses')} />
        <AppCard style={styles.list} enterIndex={2}>
          {profile.diagnoses.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.diagnoses.map((d) => (
            <View key={d.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{d.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {d.icd10 ? `${d.icd10} · ` : ''}
                  {t('profile.since', { date: d.diagnosedAt })}
                </AppText>
              </View>
              <Badge label={t(`enums.diagnosisStatus.${d.status}`)} color={d.status === 'active' ? colors.warning : colors.success} />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('profile.treatments')} />
        <AppCard style={styles.list} enterIndex={3}>
          {profile.treatments.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.treatments.map((tr) => (
            <View key={tr.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{tr.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {tr.dosage} · {tr.frequency}
                </AppText>
              </View>
              <Badge label={tr.active ? t('enums.treatment.active') : t('enums.treatment.ended')} color={tr.active ? colors.primary : colors.textMuted} />
            </View>
          ))}
        </AppCard>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemText: { flex: 1, gap: spacing.xxs },
});
