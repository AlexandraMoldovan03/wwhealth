import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl } from 'react-native';

import { AppButton, AppText, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { IntelligenceSummaryView } from '@/screens/shared/components/IntelligenceSummaryView';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

import { NoAccessState } from './components/NoAccessState';

/**
 * AI Medical Intelligence (doctor). Re-checked by the backend on every open: valid consent covering every section
 * of the saved summary, or a summary generated now from the granted sections only (not stored).
 */
export function PatientIntelligenceScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = id ?? '';
  const load = useCallback(() => api.getPatientIntelligence(patientId), [patientId]);
  const { data, isLoading, error, reload } = useAsync(load, { refetchOnFocus: true });
  const generate = useSubmit(api.generatePatientIntelligence);
  const language = i18n.language?.startsWith('ro') ? 'ro' : 'en';
  // A freshly generated summary is shown only while the last check still says the access is valid.
  const summary = data?.status === 'ok' || data?.status === 'none' ? (generate.data?.summary ?? data?.summary) : null;

  if (isLoading && !data) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error && !data) return <ScreenContainer edges={['bottom']}><ErrorState message={error} onRetry={reload} /></ScreenContainer>;
  if (!data) return null;
  if (data.status === 'forbidden' || data.status === 'expired' || data.status === 'revoked') {
    return <ScreenContainer edges={['bottom']}><NoAccessState status={data.status} patientName={data.patientName} /></ScreenContainer>;
  }

  const openDocument = (docId: string) => router.push({ pathname: '/doctor/patient/[id]/document/[docId]', params: { id: patientId, docId } });

  return (
    <ScreenContainer edges={['bottom']} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={colors.primary} />}>
      <Stack.Screen options={{ title: data.patientName ?? t('ai.title') }} />
      <AppText color="textMuted">{t('ai.doctorIntro')}</AppText>

      {data.status === 'no_consent' && (
        <EmptyState icon="lock-closed-outline" title={t('ai.doctorNoConsent')} message={t('ai.doctorNoConsentHint')} />
      )}
      {data.status === 'not_configured' && <EmptyState icon="cloud-offline-outline" title={t('ai.notConfigured')} message={t('ai.notConfiguredHint')} />}
      {data.status === 'none' && !summary && <EmptyState icon="sparkles-outline" title={t('ai.doctorNone')} message={t('ai.doctorNoneHint')} />}

      {data.consent && (
        <AppButton
          title={summary ? t('ai.refresh') : t('ai.generate')}
          icon="refresh-outline"
          fullWidth
          disabled={!data.aiConfigured}
          loading={generate.isLoading}
          onPress={async () => {
            // A refusal (consent expired / revoked meanwhile) → re-check and show the reason.
            if (!(await generate.run(patientId, language))) await reload();
          }}
        />
      )}
      {generate.isLoading && <AppText variant="caption" color="textMuted">{t('ai.generating')}</AppText>}
      {generate.data && <AppText variant="caption" color="textMuted">{t('ai.doctorNotStored')}</AppText>}
      {generate.error && <ErrorState title={t('ai.failed')} message={generate.error} />}

      {summary && <IntelligenceSummaryView summary={summary} onOpenDocument={data.scopes.includes('documents') ? openDocument : undefined} />}
    </ScreenContainer>
  );
}
