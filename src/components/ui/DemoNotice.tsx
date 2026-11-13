import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { MEDICAL_DISCLAIMER } from '@/constants/config';
import { iconSize, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';

/** Yellow banner shown next to any simulated / AI output. */
export function DemoNotice({ message = MEDICAL_DISCLAIMER }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: `${colors.warning}1F`, borderColor: `${colors.warning}55` }]}>
      <Ionicons name="flask-outline" size={iconSize.sm} color={colors.warning} />
      <AppText variant="caption" style={[styles.text, { color: colors.text }]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm + 4, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start' },
  text: { flex: 1 },
});
