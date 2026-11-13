import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, ListRow, ScreenContainer, SectionHeader } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { RECENT_ACTIVITY } from '@/data/activity';
import { QUICK_ACTIONS } from '@/data/quickActions';
import { ActivityRow } from '@/features/home/components/ActivityRow';
import { HeroCard } from '@/features/home/components/HeroCard';
import { QuickActionGrid } from '@/features/home/components/QuickActionGrid';
import { WelcomeHeader } from '@/features/home/components/WelcomeHeader';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';

/** Patient Dashboard (Home tab). */
export function PatientDashboardScreen() {
  const { colors } = useTheme();
  const { data: patient } = useAsync(api.getMyPatient);
  const firstName = patient?.fullName.split(' ')[0] ?? 'there';

  const stats = [
    { label: 'Allergies', value: patient?.allergies.length },
    { label: 'Active diagnoses', value: patient?.diagnoses.filter((d) => d.status === 'active').length },
    { label: 'Documents', value: patient?.documents.length },
  ];

  return (
    <ScreenContainer showLungs>
      <WelcomeHeader name={firstName} />

      <View style={styles.stats}>
        {stats.map((s) => (
          <AppCard key={s.label} style={styles.stat}>
            <AppText variant="title" color="primary">
              {s.value ?? '–'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {s.label}
            </AppText>
          </AppCard>
        ))}
      </View>

      <HeroCard />

      <View style={styles.section}>
        <SectionHeader title="Quick actions" />
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Recent activity"
          actionLabel="View all"
          onActionPress={() => router.navigate('/history')}
        />
        <AppCard>
          {RECENT_ACTIVITY.map((item, index) => (
            <View key={item.id} style={index > 0 && [styles.divider, { borderTopColor: colors.border }]}>
              <ActivityRow item={item} />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Doctor area" subtitle="Demo role switch until Auth0 roles exist" />
        <ListRow
          icon="medkit-outline"
          title="Open Doctor Dashboard"
          subtitle="Scan a patient QR passport"
          onPress={() => router.push('/doctor')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: spacing.xxs, alignItems: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
