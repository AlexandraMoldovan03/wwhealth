import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, sizes, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName } from '@/types';

import { AppText } from './AppText';

interface StateViewProps extends PropsWithChildren {
  icon: IconName;
  title: string;
  message?: string;
  tone?: 'primary' | 'danger';
}

/** Shared layout for EmptyState / ErrorState. Not exported from the UI barrel. */
export function StateView({ icon, title, message, tone = 'primary', children }: StateViewProps) {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: tone === 'danger' ? `${colors.danger}1F` : colors.primaryMuted }]}>
        <Ionicons name={icon} size={28} color={fg} />
      </View>
      <AppText variant="subheading" align="center">
        {title}
      </AppText>
      {message && (
        <AppText variant="caption" color="textMuted" align="center">
          {message}
        </AppText>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  iconWrap: {
    width: sizes.iconBadge + 12,
    height: sizes.iconBadge + 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
