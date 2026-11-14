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
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.ink : colors.surface, borderColor: active ? colors.ink : colors.border },
            ]}
          >
            <AppText variant="caption" color={active ? 'onInk' : 'text'} style={styles.label}>
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
  chip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, borderRadius: radius.pill, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  label: { fontFamily: 'DMSans_700Bold' },
});
