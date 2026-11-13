import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { MedicalEventList } from '@/features/history/components/MedicalEventList';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';

/** Medical History tab — timeline from GET /api/v1/patients/me. */
export function MedicalHistoryScreen() {
  const { colors } = useTheme();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <AppText variant="title">Medical History</AppText>
        <AppText color="textMuted">Visits, diagnoses, treatments, documents and X-rays.</AppText>
      </View>
      {isLoading && !data && <LoadingState message="Loading history…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <MedicalEventList
          events={data.history}
          onSelect={(e) => router.push({ pathname: '/history/[id]', params: { id: e.id } })}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
});
