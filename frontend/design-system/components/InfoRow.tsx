import { StyleSheet, View } from 'react-native';

import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { AppText } from './AppText';

/** "Label ........ value" row with a top divider (except the first row). */
export function InfoRow({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <AppText color="textMuted">{label}</AppText>
      <AppText variant="subheading" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  value: { flexShrink: 1, textAlign: 'right' },
});
