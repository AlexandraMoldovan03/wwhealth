import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { MEDICAL_DISCLAIMER } from '@/config/config';
import { iconSize, radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { AppText } from './AppText';

/** Yellow banner shown next to any simulated / AI output. */
export function DemoNotice({ message = MEDICAL_DISCLAIMER }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.accentMuted, borderColor: 'transparent' }]} accessibilityRole="text">
      <Ionicons name="information-circle-outline" size={iconSize.md} color={colors.accent} />
      <AppText variant="caption" style={[styles.text, { color: colors.text }]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md - 2, borderRadius: radius.lg, borderWidth: 1, alignItems: 'flex-start' },
  text: { flex: 1 },
});
