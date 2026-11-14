import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { IntelligenceSummaryView } from '@/screens/shared/components/IntelligenceSummaryView';
import { markAiSummaryOpened } from '@/screens/patient/dashboard/progressStorage';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

function confirm(title: string, message: string, onYes: () => void, yesLabel: string, cancelLabel: string) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}

/**
 * AI Medical Intelligence (patient). Nothing is sent to Gemini before the explicit consent below; the summary
 * is checked against the stored data on the server and only the latest one is kept (deletable anytime).
 */
export function MedicalIntelligenceScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyIntelligence, { refetchOnFocus: true });
  const consent = useSubmit(api.setAiConsent);
  const generate = useSubmit(api.generateMyIntelligence);
  const remove = useSubmit(api.deleteMyIntelligence);
  const language = i18n.language?.startsWith('ro') ? 'ro' : 'en';
  const userId = useCurrentUser()?.id ?? 'local';
  // Onboarding checklist: "AI summary available or opened".
  useEffect(() => void markAiSummaryOpened(userId), [userId]);
  const view = generate.data && data?.status !== 'no_consent' ? { ...data, ...generate.data } : data;

  const setConsent = async (granted: boolean) => {
    generate.reset();
    if (await consent.run(granted)) await reload();
  };
  const onGenerate = async () => {
    if (await generate.run(language)) await reload();
  };
  const onRevoke = () =>
    confirm(t('ai.consent.revokeTitle'), t('ai.consent.revokeMessage'), () => void setConsent(false), t('ai.consent.revoke'), t('common.cancel'));
  const onDelete = () =>
    confirm(t('ai.deleteTitle'), t('ai.deleteMessage'), async () => {
      generate.reset();
      await remove.run();
      await reload();
    }, t('ai.delete'), t('common.cancel'));

  const openDocument = (id: string) => router.push({ pathname: '/patient/document/[id]', params: { id } });

  return (
    <ScreenContainer edges={['bottom']} help="intelligence" refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <AppText color="textMuted">{t('ai.intro')}</AppText>

      {isLoading && !data && <LoadingState count={3} />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {view?.status === 'no_consent' && (
        <AppCard style={styles.card} enterIndex={0}>
          <AppText variant="subheading">{t('ai.consent.title')}</AppText>
          <AppText color="textMuted">{t('ai.consent.what')}</AppText>
          <AppText color="textMuted">{t('ai.consent.notSent')}</AppText>
          <AppText color="textMuted">{t('ai.consent.storage')}</AppText>
          <AppButton title={t('ai.consent.accept')} icon="checkmark-circle-outline" fullWidth loading={consent.isLoading} onPress={() => void setConsent(true)} />
          {consent.error && <ErrorState compact message={consent.error} />}
        </AppCard>
      )}

      {view && view.status !== 'no_consent' && (
        <>
          {view.status === 'not_configured' && (
            <EmptyState icon="cloud-offline-outline" title={t('ai.notConfigured')} message={t('ai.notConfiguredHint')} />
          )}
          {view.status === 'none' && <EmptyState icon="sparkles-outline" title={t('ai.none')} message={t('ai.noneHint')} />}

          <AppButton
            title={view.summary ? t('ai.refresh') : t('ai.generate')}
            icon="refresh-outline"
            fullWidth
            disabled={!view.aiConfigured}
            loading={generate.isLoading}
            onPress={() => void onGenerate()}
          />
          {generate.isLoading && <AppText variant="caption" color="textMuted">{t('ai.generating')}</AppText>}
          {generate.error && <ErrorState title={t('ai.failed')} message={generate.error} />}

          {view.summary && <IntelligenceSummaryView summary={view.summary} onOpenDocument={openDocument} />}

          <View style={styles.actions}>
            {view.summary && (
              <AppButton title={t('ai.delete')} icon="trash-outline" variant="outline" size="sm" loading={remove.isLoading} onPress={onDelete} />
            )}
            <AppButton title={t('ai.consent.revoke')} icon="close-circle-outline" variant="outline" size="sm" loading={consent.isLoading} onPress={onRevoke} />
          </View>
          {(remove.error || consent.error) && <ErrorState compact message={remove.error ?? consent.error ?? ''} />}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
