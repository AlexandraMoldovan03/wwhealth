import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, SegmentedControl } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { CareInsightsPanel } from '@/screens/shared/components/CareInsightsPanel';
import { OrganizedRecordView } from '@/screens/shared/components/RecordItemList';
import { api } from '@/services/backend';
import type { RecordItem, RecordView } from '@/types';

const VIEWS = ['relevance', 'chronological', 'category'] as const;

/**
 * Intelligent medical record (patient): one record, three views — relevance (allergies and active treatments always
 * first; for an appointment, items matching its reason), chronological, by category (empty categories hidden).
 * Every item shows source, date, author and verification; declared data is never presented as validated.
 */
export function SmartRecordScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const [view, setView] = useState<RecordView>(appointmentId ? 'relevance' : 'chronological');
  const load = useCallback(() => api.getMyRecordView(view, appointmentId ?? null, language), [view, appointmentId, language]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const insights = useCallback(() => api.getMyInsights(language, null), [language]);

  const open = (i: RecordItem) => {
    if (i.documentId) router.push({ pathname: '/patient/document/[id]', params: { id: i.documentId } });
    else if (i.planId) router.push('/patient/treatments');
  };
  const empty = data && data.items.length === 0 && data.sections.length === 0;

  return (
    <ScreenContainer edges={['bottom']} help="smartRecord" refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <SegmentedControl options={VIEWS} value={view} onChange={setView} getLabel={(v) => t(`cj.record.view.${v}`)} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingState count={3} />}
      {empty && (
        <EmptyState icon="folder-open-outline" title={t('cj.record.empty')} message={t('cj.record.emptyHint')}
          actionLabel={t('cj.record.addData')} onAction={() => router.push('/patient/edit-profile')} />
      )}
      {data && !empty && (
        <View style={styles.list}>
          <OrganizedRecordView record={data} onOpen={open} />
          <CareInsightsPanel perspective="patient" fetch={insights} onConsent={() => router.push('/patient/intelligence')} />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
