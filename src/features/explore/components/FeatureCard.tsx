import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, IconBadge } from '@/components/ui';
import { iconSize, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Feature } from '@/types';

export function FeatureCard({ feature, onPress }: { feature: Feature; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AppCard onPress={onPress} accessibilityLabel={feature.title}>
      <View style={styles.row}>
        <IconBadge icon={feature.icon} color={feature.isAvailable ? undefined : colors.textMuted} />
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <AppText variant="subheading" style={styles.title}>
              {feature.title}
            </AppText>
            <Badge
              label={feature.isAvailable ? feature.category : 'Soon'}
              color={feature.isAvailable ? colors.primary : colors.textMuted}
            />
          </View>
          <AppText variant="caption" color="textMuted">
            {feature.description}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textSubtle} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { flexShrink: 1 },
});
