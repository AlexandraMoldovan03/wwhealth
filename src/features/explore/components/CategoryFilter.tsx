import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface CategoryFilterProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Optional display label (defaults to the value itself). */
  getLabel?: (value: T) => string;
}

/** Horizontal row of selectable chips. */
export function CategoryFilter<T extends string>({ options, value, onChange, getLabel }: CategoryFilterProps<T>) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
            ]}
          >
            <AppText variant="caption" color={active ? 'onPrimary' : 'text'} style={styles.label}>
              {getLabel ? getLabel(option) : option}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  label: { fontWeight: '600' },
});
