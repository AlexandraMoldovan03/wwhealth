import { StyleSheet, View } from 'react-native';

import { AppText, Badge } from '@/components/ui';
import { APP_INFO } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeHeader({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Badge label={APP_INFO.name} color={colors.primary} />
      <AppText variant="display">
        {getGreeting(new Date().getHours())}, {name} 👋
      </AppText>
      <AppText color="textMuted">{APP_INFO.fullName} — your health record, in your pocket.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingTop: spacing.sm },
});
