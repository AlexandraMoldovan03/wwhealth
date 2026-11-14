import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, InfoRow } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { PatientProfile } from '@/types';
import { useTranslation } from 'react-i18next';

type DropdownName = 'allergies' | 'diagnoses' | 'treatments';

function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) years -= 1;
  return years;
}

/** Personal data + allergies + diagnoses + treatments. */
export function ProfileSections({ profile }: { profile: PatientProfile }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<DropdownName, boolean>>({
    allergies: false,
    diagnoses: false,
    treatments: false,
  });
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;
  const toggle = (name: DropdownName) => setExpanded((current) => ({ ...current, [name]: !current[name] }));

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
        <ProfileDropdown title={t('profile.allergies')} count={profile.allergies.length} expanded={expanded.allergies} onPress={() => toggle('allergies')}>
          {profile.allergies.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.allergies.map((allergy) => (
            <View key={allergy.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{allergy.substance}</AppText>
                <AppText variant="caption" color="textMuted">{allergy.reaction}</AppText>
              </View>
              <Badge label={t(`enums.severity.${allergy.severity}`)} color={severityColor[allergy.severity]} />
            </View>
          ))}
        </ProfileDropdown>
      </View>

      <View style={styles.section}>
        <ProfileDropdown title={t('profile.diagnoses')} count={profile.diagnoses.length} expanded={expanded.diagnoses} onPress={() => toggle('diagnoses')}>
          {profile.diagnoses.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.diagnoses.map((diagnosis) => (
            <View key={diagnosis.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{diagnosis.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {diagnosis.icd10 ? `${diagnosis.icd10} · ` : ''}
                  {t('profile.since', { date: diagnosis.diagnosedAt })}
                </AppText>
              </View>
              <Badge label={t(`enums.diagnosisStatus.${diagnosis.status}`)} color={diagnosis.status === 'active' ? colors.warning : colors.success} />
            </View>
          ))}
        </ProfileDropdown>
      </View>

      <View style={styles.section}>
        <ProfileDropdown title={t('profile.treatments')} count={profile.treatments.length} expanded={expanded.treatments} onPress={() => toggle('treatments')}>
          {profile.treatments.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.treatments.map((treatment) => (
            <View key={treatment.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{treatment.name}</AppText>
                <AppText variant="caption" color="textMuted">{treatment.dosage} · {treatment.frequency}</AppText>
              </View>
              <Badge label={treatment.active ? t('enums.treatment.active') : t('enums.treatment.ended')} color={treatment.active ? colors.primary : colors.textMuted} />
            </View>
          ))}
        </ProfileDropdown>
      </View>

      {profile.surgeries && (
        <View style={styles.section}>
          <AppText variant="heading">{t('profile.surgeries')}</AppText>
          <AppCard style={styles.list} enterIndex={4}>
            {profile.surgeries.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
            {profile.surgeries.map((surgery) => (
              <View key={surgery.id} style={styles.itemText}>
                <AppText variant="subheading">{surgery.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {[surgery.date, surgery.notes].filter(Boolean).join(' · ') || t('profile.noDate')}
                </AppText>
              </View>
            ))}
          </AppCard>
        </View>
      )}
    </>
  );
}

function ProfileDropdown({
  title,
  count,
  expanded,
  onPress,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <AppCard onPress={onPress} accessibilityLabel={`${title}: ${count}`} style={styles.dropdown}>
        <AppText variant="subheading" style={styles.dropdownTitle}>{title}</AppText>
        <AppText variant="caption" color="textMuted">{count}</AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#5C6B70" />
      </AppCard>
      {expanded && <AppCard style={styles.list}>{children}</AppCard>}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemText: { flex: 1, gap: spacing.xxs },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dropdownTitle: { flex: 1 },
});
