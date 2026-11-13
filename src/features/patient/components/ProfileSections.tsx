import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, InfoRow, SectionHeader } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { PatientProfile } from '@/types';

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
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;

  return (
    <>
      <AppCard>
        <InfoRow first label="Name" value={profile.fullName} />
        <InfoRow label="Age" value={`${age(profile.dateOfBirth)} (${profile.dateOfBirth})`} />
        <InfoRow label="Sex" value={profile.sex} />
        <InfoRow label="Blood type" value={profile.bloodType ?? '—'} />
        <InfoRow label="Height / weight" value={`${profile.heightCm ?? '—'} cm · ${profile.weightKg ?? '—'} kg`} />
        {profile.emergencyContact && (
          <InfoRow
            label="Emergency contact"
            value={`${profile.emergencyContact.name} (${profile.emergencyContact.relation}) ${profile.emergencyContact.phone}`}
          />
        )}
      </AppCard>

      <View style={styles.section}>
        <SectionHeader title="Allergies" />
        <AppCard style={styles.list}>
          {profile.allergies.length === 0 && <AppText color="textMuted">None recorded</AppText>}
          {profile.allergies.map((a) => (
            <View key={a.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{a.substance}</AppText>
                <AppText variant="caption" color="textMuted">
                  {a.reaction}
                </AppText>
              </View>
              <Badge label={a.severity} color={severityColor[a.severity]} />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Diagnoses" />
        <AppCard style={styles.list}>
          {profile.diagnoses.length === 0 && <AppText color="textMuted">None recorded</AppText>}
          {profile.diagnoses.map((d) => (
            <View key={d.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{d.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {d.icd10 ? `${d.icd10} · ` : ''}since {d.diagnosedAt}
                </AppText>
              </View>
              <Badge label={d.status} color={d.status === 'active' ? colors.warning : colors.success} />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Treatments" />
        <AppCard style={styles.list}>
          {profile.treatments.length === 0 && <AppText color="textMuted">None recorded</AppText>}
          {profile.treatments.map((t) => (
            <View key={t.id} style={styles.item}>
              <View style={styles.itemText}>
                <AppText variant="subheading">{t.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t.dosage} · {t.frequency}
                </AppText>
              </View>
              <Badge label={t.active ? 'active' : 'ended'} color={t.active ? colors.primary : colors.textMuted} />
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
