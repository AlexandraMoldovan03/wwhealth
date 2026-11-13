import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { APP_INFO } from '@/constants/config';
import { spacing } from '@/constants/theme';

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeHeader({ name }: { name: string }) {
  return (
    <View style={styles.container}>
      <AppText variant="display" align="center" style={styles.brand}>
        {APP_INFO.name}
      </AppText>
      <View style={styles.greeting}>
        <AppText variant="heading">
          {getGreeting(new Date().getHours())}, {name}
        </AppText>
        <AppText variant="caption">Here is your health overview.</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.sm },
  brand: { paddingVertical: spacing.sm },
  greeting: { gap: spacing.xxs },
});
