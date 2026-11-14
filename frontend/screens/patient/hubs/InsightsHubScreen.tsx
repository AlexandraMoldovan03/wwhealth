import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, IconBadge, ListRow, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { HeroCard } from '@/screens/patient/dashboard/components/HeroCard';
import { DataOriginBadge, DataOriginLegend } from '@/screens/shared/components/DataOrigin';
import { api } from '@/services/backend';
import type { IntelligenceView } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const tabs = [
  { id: 'care', title: 'hubs.insights.careTitle', icon: 'medkit-outline' },
  { id: 'summary', title: 'hubs.insights.summaryTitle', icon: 'document-text-outline' },
  { id: 'imaging', title: null, icon: 'scan-outline' },
] as const;

function aiStatusKey(view: IntelligenceView | null, failed: boolean) {
  if (failed || !view) return failed ? 'hubs.insights.aiUnknown' : 'hubs.insights.aiLoading';
  if (!view.aiConfigured) return 'hubs.insights.aiNotConfigured';
  if (!view.consent) return 'hubs.insights.aiNeedsConsent';
  return view.summary ? 'hubs.insights.aiReady' : 'hubs.insights.aiNotGenerated';
}

/** "AI Medical Insights" (UNDERSTAND): AI summary with sources and LungVision — clearly marked as AI, never a diagnosis. */
export function InsightsHubScreen() {
  const { colors, isDark } = useTheme();
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('care');
  const [showGemini, setShowGemini] = useState(false);
  const { t } = useTranslation();
  const ai = useAsync(api.getMyIntelligence, { refetchOnFocus: true });
  const patient = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const xrays = patient.data?.xrays.length ?? 0;
  const summary = ai.data?.summary;

  return (
    <ScreenContainer help="insights" showBackgroundLungs={false} refreshControl={<RefreshControl refreshing={ai.isLoading && !!ai.data} onRefresh={ai.reload} tintColor={colors.primary} />}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">{t('hubs.insights.title')}</AppText>
        <AppText color="textMuted">{t('hubs.insights.subtitle')}</AppText>
      </View>

      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setActive(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                selected && { backgroundColor: colors.primaryMuted },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={tab.icon} size={19} color={selected ? colors.primary : colors.textMuted} />
              <AppText variant="caption" align="center" color={selected ? 'primary' : 'textMuted'} style={styles.tabLabel}>
                {tab.title ? t(tab.title) : 'LungVision'}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {active === 'care' && (
        <View style={styles.section}>
          <AppCard style={[styles.lead, { backgroundColor: isDark ? '#182F36' : '#E9F4F1' }]}>
            <View style={styles.leadTop}>
              <IconBadge icon="medkit-outline" color={colors.primary} />
              <DataOriginBadge origin="ai" />
            </View>
            <AppText variant="heading" accessibilityRole="header">{t('hubs.insights.care')}</AppText>
            <AppText color="textMuted">{t('hubs.insights.careHint')}</AppText>
            <AppButton
              title={t('hubs.insights.careAction')}
              trailingIcon="arrow-forward"
              fullWidth
              onPress={() => router.push('/patient/smart-care')}
            />
          </AppCard>
          <ListRow
            icon="search-outline"
            iconColor={colors.primary}
            title={t('hubs.insights.specialties')}
            subtitle={t('hubs.insights.specialtiesHint')}
            enterIndex={1}
            onPress={() => router.push('/patient/specialties')}
          />
        </View>
      )}

      {active === 'summary' && (
        <View style={styles.section}>
          <ListRow
            icon="sparkles-outline"
            iconColor={colors.accent}
            title={t('ai.title')}
            subtitle={t(aiStatusKey(ai.data, !!ai.error && !ai.data), { date: summary ? formatDateTime(summary.generatedAt) : '' })}
            right={<DataOriginBadge origin="ai" />}
            enterIndex={1}
            onPress={() => router.push('/patient/intelligence')}
          />
          <AppCard tone="flat">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showGemini }}
              onPress={() => setShowGemini((current) => !current)}
              style={styles.disclosure}
            >
              <AppText variant="subheading" style={styles.disclosureTitle}>{t('explain.gemini.title')}</AppText>
              <Ionicons name={showGemini ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
            </Pressable>
            {showGemini && <AppText color="textMuted">{t('explain.gemini.text')}</AppText>}
          </AppCard>
        </View>
      )}

      {active === 'imaging' && (
        <View style={styles.section}>
          <HeroCard enterIndex={2} />
          <ListRow
            icon="images-outline"
            iconColor={colors.accent}
            title={t('hubs.insights.xrays')}
            subtitle={xrays > 0 ? t('hubs.insights.xraysCount', { count: xrays }) : t('hubs.insights.xraysEmpty')}
            enterIndex={3}
            onPress={() => router.push('/patient/xray-results')}
          />
        </View>
      )}

      {active !== 'care' && <DataOriginLegend />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.md,
  },
  tabLabel: { fontWeight: '600' },
  pressed: { opacity: 0.72 },
  section: { gap: spacing.md },
  lead: { gap: spacing.md, borderRadius: radius.xl },
  leadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  disclosureTitle: { flex: 1 },
});
