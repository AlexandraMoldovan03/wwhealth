import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';

import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { Skeleton } from './Skeleton';

interface StatTileProps {
  icon: IconName;
  label: string;
  /** undefined = loading (skeleton). */
  value: string | number | undefined;
  tint?: string;
  onPress?: () => void;
  enterIndex?: number;
}

/** Small metric card: icon chip, big value, label. */
export function StatTile({ icon, label, value, tint, onPress, enterIndex }: StatTileProps) {
  const { colors } = useTheme();
  const fg = tint ?? colors.primary;
  return (
    <AppCard
      style={styles.tile}
      onPress={onPress}
      enterIndex={enterIndex}
      accessibilityLabel={`${label}: ${value ?? '…'}`}
    >
      <View style={[styles.chip, { backgroundColor: `${fg}22` }]}>
        <Ionicons name={icon} size={16} color={fg} />
      </View>
      {value === undefined ? (
        <Skeleton width="55%" height={24} />
      ) : (
        <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </AppText>
      )}
      <AppText variant="caption" color="textMuted" numberOfLines={2}>
        {label}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: spacing.sm, minHeight: 116 },
  chip: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
