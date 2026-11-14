import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/constants/theme';

import { AppText } from './AppText';

/** Small coloured pill, e.g. "DEMO", "Completed". `color` is any theme colour. */
export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22` }]}>
      <AppText variant="label" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, borderRadius: radius.pill, alignSelf: 'flex-start' },
});
