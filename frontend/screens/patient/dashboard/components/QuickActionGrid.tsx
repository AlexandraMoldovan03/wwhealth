import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import type { QuickAction, QuickActionTone } from '@/screens/patient/dashboard/quickActions';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

export function QuickActionGrid({ actions, startIndex = 0 }: { actions: QuickAction[]; startIndex?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tones: Record<QuickActionTone, { bg: string; fg: string }> = {
    sage: { bg: colors.primaryMuted, fg: colors.primary },
    blue: { bg: colors.accentMuted, fg: colors.accent },
    coral: { bg: colors.coralMuted, fg: colors.danger },
    teal: { bg: colors.surfaceAlt, fg: colors.text },
  };
  return (
    <View style={styles.grid}>
      {actions.map((action, i) => {
        const title = t(`home.actions.${action.id}.title`, { defaultValue: action.title });
        const subtitle = t(`home.actions.${action.id}.subtitle`, { defaultValue: action.subtitle });
        const tone = tones[action.tone];
        return (
          <AppCard
            key={action.id}
            style={styles.item}
            enterIndex={startIndex + i}
            onPress={() => router.navigate(action.route)}
            accessibilityLabel={`${title}, ${subtitle}`}
          >
            <View style={styles.top}>
              <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                <Ionicons name={action.icon} size={22} color={tone.fg} />
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textSubtle} />
            </View>
            <View style={styles.text}>
              <AppText variant="subheading">
                {title}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {subtitle}
              </AppText>
            </View>
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Two columns: each card takes ~half the row minus the gap.
  item: { flexBasis: '46%', flexGrow: 1, gap: spacing.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  icon: { width: 48, height: 48, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  text: { gap: spacing.xxs },
});
