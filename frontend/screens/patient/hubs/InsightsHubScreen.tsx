import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListRow, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { HeroCard } from '@/screens/patient/dashboard/components/HeroCard';
import { DataOriginBadge, DataOriginLegend } from '@/screens/shared/components/DataOrigin';
import { FeatureExplainer } from '@/screens/shared/components/FeatureExplainer';
import { HubHeader } from '@/screens/shared/components/HubHeader';
import { api } from '@/services/backend';
import type { IntelligenceView } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

function aiStatusKey(view: IntelligenceView | null, failed: boolean) {
  if (failed || !view) return failed ? 'hubs.insights.aiUnknown' : 'hubs.insights.aiLoading';
  if (!view.aiConfigured) return 'hubs.insights.aiNotConfigured';
  if (!view.consent) return 'hubs.insights.aiNeedsConsent';
  return view.summary ? 'hubs.insights.aiReady' : 'hubs.insights.aiNotGenerated';
}

/** "AI Medical Insights" (UNDERSTAND): AI summary with sources and LungVision — clearly marked as AI, never a diagnosis. */
export function InsightsHubScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const ai = useAsync(api.getMyIntelligence, { refetchOnFocus: true });
  const patient = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const xrays = patient.data?.xrays.length ?? 0;
  const summary = ai.data?.summary;

  return (
    <ScreenContainer help="insights" refreshControl={<RefreshControl refreshing={ai.isLoading && !!ai.data} onRefresh={ai.reload} tintColor={colors.primary} />}>
      <HubHeader step={t('journey.understand.title')} title={t('hubs.insights.title')} subtitle={t('hubs.insights.subtitle')} />

      <View style={styles.section}>
        <SectionHeader title={t('hubs.insights.summaryTitle')} subtitle={t('hubs.insights.summarySubtitle')} />
        <ListRow
          icon="sparkles-outline"
          iconColor={colors.accent}
          title={t('ai.title')}
          subtitle={t(aiStatusKey(ai.data, !!ai.error && !ai.data), { date: summary ? formatDateTime(summary.generatedAt) : '' })}
          right={<DataOriginBadge origin="ai" />}
          enterIndex={1}
          onPress={() => router.push('/patient/intelligence')}
        />
        <FeatureExplainer id="gemini" />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('hubs.insights.imagingTitle')} subtitle={t('hubs.insights.imagingSubtitle')} />
        <HeroCard enterIndex={2} />
        <ListRow
          icon="images-outline"
          iconColor={colors.accent}
          title={t('hubs.insights.xrays')}
          subtitle={xrays > 0 ? t('hubs.insights.xraysCount', { count: xrays }) : t('hubs.insights.xraysEmpty')}
          enterIndex={3}
          onPress={() => router.push('/patient/xray-results')}
        />
        <FeatureExplainer id="lungvision" />
      </View>

      <DataOriginLegend enterIndex={4} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.md } });
