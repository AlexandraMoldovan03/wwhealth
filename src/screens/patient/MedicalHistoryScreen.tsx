import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { MedicalEventList } from '@/features/history/components/MedicalEventList';
import { loadIntakes, type SavedIntake } from '@/features/intake/intakeStorage';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import type { MedicalEvent } from '@/types';
import { useTranslation } from 'react-i18next';

const FILTERS = ['all', 'document', 'xray', 'diagnosis', 'treatment'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Medical Timeline tab — built from real data in GET /api/v1/patients/me:
 * uploaded documents, saved LungVision results, conditions and medication. No synthetic entries.
 */
export function MedicalHistoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const [filter, setFilter] = useState<Filter>('all');
  const user = useCurrentUser();
  const userId = user?.id;
  const loadSaved = useCallback(() => userId ? loadIntakes(userId) : Promise.resolve([]), [userId]);
  const { data: savedIntakes, error: intakeError, isLoading: loadingIntakes, reload: reloadIntakes } =
    useAsync(loadSaved, { refetchOnFocus: true });


  const events = useMemo(
    () => [...(data?.history ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)).filter((e) => filter === 'all' || e.type === filter),
    [data, filter],
  );

  // Documents open directly; other entries show their details.
  const open = (e: MedicalEvent) =>
    e.documentId
      ? router.push({ pathname: '/patient/document/[id]', params: { id: e.documentId } })
      : router.push({ pathname: '/history/[id]', params: { id: e.id } });

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={(isLoading && !!data) || loadingIntakes} onRefresh={() => void Promise.all([reload(), reloadIntakes()])} tintColor={colors.primary} />}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('history.title')}
        </AppText>
        <AppText color="textMuted">{t('history.subtitle')}</AppText>
      </View>
      <CategoryFilter options={FILTERS} value={filter} onChange={setFilter} getLabel={(f) => (f === 'all' ? t('history.all') : t(`history.types.${f}`))} />
      {intakeError && <ErrorState message={intakeError} onRetry={reloadIntakes} />}
      {filter === 'all' && savedIntakes?.some((entry) => entry.userId === userId) && (
        <View style={styles.entries}>
          <AppText variant="heading">Saved symptom forms</AppText>
          <AppText color="textMuted">Saved on this device.</AppText>
          {savedIntakes.filter((entry) => entry.userId === userId).map((entry) => <SavedIntakeCard key={entry.id} entry={entry} />)}
        </View>
      )}
      {isLoading && !data && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && <MedicalEventList events={events} onSelect={open} grouped />}
    </ScreenContainer>
  );
}

function SavedIntakeCard({ entry }: { entry: SavedIntake }) {
  const [expanded, setExpanded] = useState(false);
  const { form, savedAt } = entry;
  return (
    <AppCard style={styles.entries}>
      <AppText variant="caption" color="textMuted">
        {new Date(savedAt).toLocaleString()}{form.isDemo ? ' · Demo' : ''}
      </AppText>
      <AppText variant="subheading">{form.summary}</AppText>
      {form.urgentWarning && <AppText color="danger">Possible urgent symptoms flagged</AppText>}
      <AppButton title={expanded ? 'Hide form' : 'View form'} variant="outline" size="sm"
        accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} />
      {expanded && (
        <View style={styles.entries}>
          {form.symptoms.map((symptom, index) => (
            <AppText key={index}>{[symptom.name, symptom.duration, symptom.severity, symptom.notes].filter(Boolean).join(' · ')}</AppText>
          ))}
          <AppText>Medications: {form.medicationsMentioned.join(', ') || 'None mentioned'}</AppText>
          <AppText>Allergies: {form.allergiesMentioned.join(', ') || 'None mentioned'}</AppText>
          <AppText variant="subheading">Original transcript</AppText>
          <AppText selectable>{form.transcript}</AppText>
          <AppText variant="caption" color="textMuted">{form.disclaimer}</AppText>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  entries: { gap: spacing.sm },
  header: { gap: spacing.xs },
});
