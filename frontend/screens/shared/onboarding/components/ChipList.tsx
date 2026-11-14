import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { AppText, fadeIn, fadeOut } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

/** Removable chips for the items the user added (onboarding lists). */
export function ChipList({ items, onRemove }: { items: { key: string; label: string }[]; onRemove: (key: string) => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Animated.View
          key={item.key}
          entering={fadeIn()}
          exiting={fadeOut}
          layout={LinearTransition.reduceMotion(ReduceMotion.System)}
          style={[styles.chip, { backgroundColor: colors.primaryMuted }]}
        >
          <AppText variant="caption" style={styles.label}>
            {item.label}
          </AppText>
          <Pressable
            onPress={() => onRemove(item.key)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.remove', { item: item.label })}
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm + 2, borderRadius: radius.pill },
  label: { fontFamily: 'DMSans_700Bold' },
});
