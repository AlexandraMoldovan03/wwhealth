import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { HistoryCard } from '@/features/history/components/HistoryCard';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { getHistory } from '@/services/historyService';

export function HistoryScreen() {
  const { colors } = useTheme();
  const { data, isLoading, error, reload } = useAsync(getHistory);

  const renderContent = () => {
    if (isLoading && !data) return <LoadingState message="Loading history…" />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!data || data.length === 0) {
      return <EmptyState title="No analyses yet" message="Run your first analysis to see it here." />;
    }
    return data.map((item) => (
      <HistoryCard
        key={item.id}
        item={item}
        onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
      />
    ));
  };

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <AppText variant="title">History</AppText>
        <AppText color="textMuted">Pull down to refresh. Tap an item for details.</AppText>
      </View>
      <View style={styles.list}>{renderContent()}</View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  list: { gap: spacing.md },
});
