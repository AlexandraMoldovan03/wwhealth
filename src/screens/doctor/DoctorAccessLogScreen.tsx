import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { EmergencyAuditList } from '@/features/emergency/components/EmergencyAuditList';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** Doctor tab: own Emergency Passport scans (GET /api/v1/emergency/my-accesses). */
export function DoctorAccessLogScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyEmergencyAccesses, { refetchOnFocus: true });

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('doctor.accessLog.title')}
        </AppText>
        <AppText color="textMuted">{t('doctor.accessLog.subtitle')}</AppText>
      </View>
      {isLoading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <EmergencyAuditList events={data} perspective="doctor" />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
});
