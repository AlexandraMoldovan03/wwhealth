import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppText, Badge, IconBadge } from '@/design-system';
import { iconSize, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { Feature } from '@/types';
import { useTranslation } from 'react-i18next';

export function FeatureCard({ feature, onPress }: { feature: Feature; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
              label={feature.isAvailable ? t(`explore.categories.${feature.category}`) : t('explore.soon')}
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
