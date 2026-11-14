import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListRow, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { EmergencyCard } from '@/screens/patient/dashboard/components/EmergencyCard';
import { FeatureExplainer } from '@/screens/shared/components/FeatureExplainer';
import { HubHeader } from '@/screens/shared/components/HubHeader';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** "Transfer & Access" (CONTROL → CONNECT): emergency QR, time-limited doctor access, what a doctor sees. */
export function TransferHubScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const access = useAsync(api.getDoctorAccess, { refetchOnFocus: true });
  const active = access.data?.grants.filter((g) => g.status === 'active').length;

  return (
    <ScreenContainer help="transfer" refreshControl={<RefreshControl refreshing={access.isLoading && !!access.data} onRefresh={access.reload} tintColor={colors.primary} />}>
      <HubHeader step={`${t('journey.control.title')} → ${t('journey.connect.title')}`} title={t('hubs.transfer.title')} subtitle={t('hubs.transfer.subtitle')} />

      <View style={styles.section}>
        <SectionHeader title={t('hubs.transfer.emergencyTitle')} subtitle={t('hubs.transfer.emergencySubtitle')} />
        <EmergencyCard enterIndex={1} />
        <FeatureExplainer id="qr" />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('hubs.transfer.doctorsTitle')} subtitle={t('hubs.transfer.doctorsSubtitle')} />
        <ListRow
          icon="shield-checkmark-outline"
          iconColor={colors.primary}
          title={t('hubs.transfer.doctorAccess')}
          subtitle={
            active === undefined
              ? t('hubs.transfer.doctorAccessHint')
              : active > 0
                ? t('hubs.transfer.activeGrants', { count: active })
                : t('hubs.transfer.noGrants')
          }
          enterIndex={2}
          onPress={() => router.push('/patient/doctor-access')}
        />
        <ListRow
          icon="reader-outline"
          iconColor={colors.primary}
          title={t('hubs.transfer.summary')}
          subtitle={t('hubs.transfer.summaryHint')}
          enterIndex={3}
          onPress={() => router.push('/patient/summary')}
        />
        <FeatureExplainer id="consent" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.md } });
