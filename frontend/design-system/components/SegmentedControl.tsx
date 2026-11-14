import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { AppText } from './AppText';
import { tapFeedback } from '@/design-system/motion';

interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  getLabel: (value: T) => string;
}

/** iOS-style segmented control (same look as the theme selector). */
export function SegmentedControl<T extends string>({ options, value, onChange, getLabel }: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              tapFeedback();
              onChange(option);
            }}
            style={[styles.option, active && { backgroundColor: colors.surface }]}
          >
            <AppText variant="caption" color={active ? 'text' : 'textMuted'} style={styles.label}>
              {getLabel(option)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  label: { fontFamily: fonts.bodyBold },
});
