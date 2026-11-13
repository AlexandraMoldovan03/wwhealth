import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, ScreenContainer, SectionHeader } from '@/components/ui';
import { RECENT_ACTIVITY } from '@/data/activity';
import { QUICK_ACTIONS } from '@/data/quickActions';
import { ActivityRow } from '@/features/home/components/ActivityRow';
import { HeroCard } from '@/features/home/components/HeroCard';
import { QuickActionGrid } from '@/features/home/components/QuickActionGrid';
import { WelcomeHeader } from '@/features/home/components/WelcomeHeader';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function HomeScreen() {
  const { colors } = useTheme();
  return (
    <ScreenContainer>
      <WelcomeHeader name="Team" />
      <HeroCard />

      <View style={styles.section}>
        <SectionHeader title="Quick actions" subtitle="Jump into the main features" />
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Recent activity"
          subtitle="Demo data"
          actionLabel="See all"
          onActionPress={() => router.navigate('/history')}
        />
        <AppCard>
          {RECENT_ACTIVITY.map((item, index) => (
            <View
              key={item.id}
              style={index > 0 && [styles.divider, { borderTopColor: colors.border }]}
            >
              <ActivityRow item={item} />
            </View>
          ))}
        </AppCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
