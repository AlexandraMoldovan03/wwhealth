import { StyleSheet, View } from 'react-native';

import { AppText, Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

/** Title of a main section, with the step of the WWHealth story it belongs to (COLLECT, UNDERSTAND…). */
export function HubHeader({ title, subtitle, step }: { title: string; subtitle: string; step?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {step && <Badge label={step} color={colors.primary} />}
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText color="textMuted">{subtitle}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.xs } });
