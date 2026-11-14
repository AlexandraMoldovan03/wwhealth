import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';
import { SkeletonList } from './Skeleton';

/**
 * No message → skeleton cards (content is on its way).
 * With a message → spinner + text (a longer operation, e.g. AI analysis).
 */
export function LoadingState({ message, count }: { message?: string; count?: number }) {
  const { colors } = useTheme();
  if (!message) return <SkeletonList count={count} />;
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="caption" color="textMuted" align="center">
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
});
