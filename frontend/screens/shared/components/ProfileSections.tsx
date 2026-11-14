import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, InfoRow } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
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

function ProfileCard({
  title,
  icon,
  count,
  children,
}: PropsWithChildren<{ title: string; icon: ComponentProps<typeof Ionicons>['name']; count?: number }>) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const isAllergies = icon === 'alert-circle-outline';
  const tint = isAllergies ? colors.danger : colors.accent;

  const header = (
    <View style={styles.cardHeader}>
      <View style={[styles.icon, { backgroundColor: isAllergies ? colors.coralMuted : colors.accentMuted }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <AppText variant="subheading" style={styles.title}>{title}</AppText>
      {count !== undefined && (
        <>
          <AppText variant="caption" color="textMuted">{count}</AppText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
        </>
      )}
    </View>
  );

  return (
    <AppCard tone="flat" style={[styles.list, isAllergies && styles.allergiesCard]}>
      {count === undefined ? header : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title + ' (' + count + ')'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
        >
          {header}
        </Pressable>
      )}
      {(count === undefined || expanded) && children}
    </AppCard>
  );
}

/** Clinical details in reading order, with allergies first. */
export function ProfileSections({ profile, wide = false }: { profile: PatientProfile; wide?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const severityColor = { mild: colors.info, moderate: colors.warning, severe: colors.danger } as const;

  return (
    <>
      <ProfileCard title={t('profile.allergies')} icon="alert-circle-outline" count={profile.allergies.length}>
        {profile.allergies.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
        {profile.allergies.map((a) => (
          <View key={a.id} style={styles.item}>
            <View style={styles.itemText}>
              <AppText variant="subheading">{a.substance}</AppText>
              <AppText variant="body" color="textMuted">
                {a.reaction}
              </AppText>
            </View>
            <Badge label={t(`enums.severity.${a.severity}`)} color={severityColor[a.severity]} />
          </View>
        ))}
      </ProfileCard>

      <View style={[styles.clinical, wide && styles.clinicalWide]}>
        <View style={wide && styles.clinicalColumn}>
          <ProfileCard title={t('profile.diagnoses')} icon="pulse-outline" count={profile.diagnoses.length}>
            {profile.diagnoses.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
            {profile.diagnoses.map((d) => (
              <View key={d.id} style={styles.item}>
                <View style={styles.itemText}>
                  <AppText variant="subheading">{d.name}</AppText>
                  <AppText variant="body" color="textMuted">
                    {d.icd10 ? `${d.icd10} · ` : ''}
                    {t('profile.since', { date: d.diagnosedAt })}
                  </AppText>
                </View>
                <Badge label={t(`enums.diagnosisStatus.${d.status}`)} color={d.status === 'active' ? colors.warning : colors.success} />
              </View>
            ))}
          </ProfileCard>

        </View>
        <View style={wide && styles.clinicalColumn}>
          <ProfileCard title={t('profile.treatments')} icon="medical-outline" count={profile.treatments.length}>
            {profile.treatments.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
            {profile.treatments.map((tr) => (
              <View key={tr.id} style={styles.item}>
                <View style={styles.itemText}>
                  <AppText variant="subheading">{tr.name}</AppText>
                  <AppText variant="body" color="textMuted">
                    {tr.dosage} · {tr.frequency}
                  </AppText>
                </View>
                <Badge label={tr.active ? t('enums.treatment.active') : t('enums.treatment.ended')} color={tr.active ? colors.primary : colors.textMuted} />
              </View>
            ))}
          </ProfileCard>

        </View>
      </View>

      {profile.surgeries && (
        <ProfileCard title={t('profile.surgeries')} icon="bandage-outline">
          {profile.surgeries.length === 0 && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
          {profile.surgeries.map((s) => (
            <View key={s.id} style={styles.itemText}>
              <AppText variant="subheading">{s.name}</AppText>
              <AppText variant="body" color="textMuted">
                {[s.date, s.notes].filter(Boolean).join(' · ') || t('profile.noDate')}
              </AppText>
            </View>
          ))}
        </ProfileCard>
      )}
      <ProfileCard title={t('profile.personalDetails')} icon="person-outline">
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
      </ProfileCard>
    </>
  );
}

const styles = StyleSheet.create({
  clinical: { gap: spacing.md },
  clinicalWide: { flexDirection: 'row', alignItems: 'flex-start' },
  clinicalColumn: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  list: { gap: spacing.md },
  allergiesCard: { width: '84%', alignSelf: 'flex-start' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemText: { flexGrow: 1, flexShrink: 1, gap: spacing.xxs },
});
