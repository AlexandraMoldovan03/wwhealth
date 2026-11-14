import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { iconSize, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';

import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { IconBadge } from './IconBadge';

interface ListRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  iconColor?: string;
  /** Staggered entrance (index in the list). */
  enterIndex?: number;
}

/** Card with icon + title + subtitle (+ badge / chevron). Used by most lists. */
export function ListRow({ icon, title, subtitle, right, onPress, iconColor, enterIndex }: ListRowProps) {
  const { colors } = useTheme();
  return (
    <AppCard onPress={onPress} accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} enterIndex={enterIndex}>
      <View style={styles.row}>
        <IconBadge icon={icon} color={iconColor} />
        <View style={styles.text}>
          <AppText variant="subheading" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle && (
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {subtitle}
            </AppText>
          )}
        </View>
        {right}
        {onPress && !right && <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textSubtle} />}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
});
