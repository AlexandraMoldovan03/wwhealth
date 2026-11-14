import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';
import { fadeIn } from './motion';

interface StateViewProps extends PropsWithChildren {
  icon: IconName;
  title: string;
  message?: string;
  tone?: 'primary' | 'danger';
}

/** Shared layout for EmptyState / ErrorState: soft layered "illustration" + text + action. */
export function StateView({ icon, title, message, tone = 'primary', children }: StateViewProps) {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.primary;
  const halo = tone === 'danger' ? colors.coralMuted : colors.primaryMuted;
  return (
    <Animated.View entering={fadeIn()} style={styles.container} accessibilityLiveRegion={tone === 'danger' ? 'polite' : 'none'}>
      <View style={[styles.haloOuter, { backgroundColor: halo }]}>
        <View style={[styles.haloInner, { backgroundColor: colors.surface }]}>
          <Ionicons name={icon} size={28} color={fg} />
        </View>
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message && (
        <AppText color="textMuted" align="center" style={styles.message}>
          {message}
        </AppText>
      )}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  haloOuter: { width: 96, height: 96, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  haloInner: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  message: { maxWidth: 320 },
});
