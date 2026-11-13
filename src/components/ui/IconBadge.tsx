import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { iconSize, radius, sizes } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName } from '@/types';

/** Rounded square with an icon — used in cards and list rows. */
export function IconBadge({ icon, color, size = sizes.iconBadge }: { icon: IconName; color?: string; size?: number }) {
  const { colors } = useTheme();
  const fg = color ?? colors.primary;
  return (
    <View style={[styles.badge, { width: size, height: size, backgroundColor: color ? `${color}1F` : colors.primaryMuted }]}>
      <Ionicons name={icon} size={iconSize.md} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
