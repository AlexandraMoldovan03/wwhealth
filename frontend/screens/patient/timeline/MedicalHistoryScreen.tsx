import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, ErrorState, LoadingState, ScreenContainer, SegmentedControl } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { MedicalEventList } from '@/screens/shared/components/MedicalEventList';
import { LabTrendsList } from '@/screens/patient/lab-results/components/LabTrendsList';
import { buildLabSeries, labDate, labFlag } from '@/screens/patient/lab-results/labUtils';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { loadIntakes, type SavedIntake } from '@/screens/patient/voice-intake/intakeStorage';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { MedicalEvent, PatientLabValue } from '@/types';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

const VIEWS = ['timeline', 'trends'] as const;
const FILTERS = ['all', 'lab', 'document', 'xray', 'diagnosis', 'treatment'] as const;
const PERIODS = ['all', '30d', '6m', '1y'] as const;
type Filter = (typeof FILTERS)[number];
type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Period, number | null> = { all: null, '30d': 30, '6m': 183, '1y': 365 };

/** One timeline entry per document with confirmed lab values (date = analysis date, else upload date). */
function labEvents(values: PatientLabValue[], t: TFunction): MedicalEvent[] {
  const byDoc = new Map<string, PatientLabValue[]>();
  for (const v of values) byDoc.set(v.documentId, [...(byDoc.get(v.documentId) ?? []), v]);
  return [...byDoc.entries()].map(([documentId, vals]) => {
    const outside = vals.filter((v) => {
      const f = labFlag(v.value, v.referenceRange);
      return f === 'low' || f === 'high';
    }).length;
    const description = [vals[0].documentTitle, outside ? t('labs.outsideCount', { count: outside }) : null].filter(Boolean).join(' · ');
    return {
      id: `lab-${documentId}`,
      type: 'lab' as const,
      title: t('labs.eventTitle', { count: vals.length }),
      description,
      date: labDate(vals[0]),
      details: {},
      documentId,
    };
  });
}

/**
 * Medical Timeline tab — real data only: GET /patients/me (documents, LungVision, conditions, medication)
 * + GET /documents/lab-values (confirmed lab values). "Trends" charts each analysis over time.
 */
export function MedicalHistoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const patient = useAsync(api.getMyPatient, { refetchOnFocus: true });
  // Lab values are optional: if lab storage isn't set up the timeline still works.
  const labs = useAsync(api.listLabValues, { refetchOnFocus: true });
  const [view, setView] = useState<(typeof VIEWS)[number]>('timeline');
  const [filter, setFilter] = useState<Filter>('all');
  const user = useCurrentUser();
  const userId = user?.id;
  const loadSaved = useCallback(() => userId ? loadIntakes(userId) : Promise.resolve([]), [userId]);
  const { data: savedIntakes, error: intakeError, isLoading: loadingIntakes, reload: reloadIntakes } =
    useAsync(loadSaved, { refetchOnFocus: true });
  const [period, setPeriod] = useState<Period>('all');
  const [now] = useState(() => Date.now());

  const cutoff = useMemo(() => {
    const days = PERIOD_DAYS[period];
    return days === null ? null : new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  }, [period, now]);

  const visibleIntakes = view === 'timeline' && filter === 'all'
    ? (savedIntakes ?? []).filter((entry) => entry.userId === userId && (!cutoff || entry.savedAt.slice(0, 10) >= cutoff))
    : [];

  const events = useMemo(() => {
    const all = [...(patient.data?.history ?? []), ...labEvents(labs.data ?? [], t)];
    return all
      .filter((e) => filter === 'all' || e.type === filter)
      .filter((e) => !cutoff || e.date.slice(0, 10) >= cutoff)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [patient.data, labs.data, filter, cutoff, t]);

  const series = useMemo(
    () => buildLabSeries((labs.data ?? []).filter((v) => !cutoff || labDate(v) >= cutoff)),
    [labs.data, cutoff],
  );

  // Documents and lab results open the original document; other entries show their details.
  const open = (e: MedicalEvent) =>
    e.documentId
      ? router.push({ pathname: '/patient/document/[id]', params: { id: e.documentId } })
      : router.push({ pathname: '/history/[id]', params: { id: e.id } });

  const refresh = () => {
    void patient.reload();
    void labs.reload();
    void reloadIntakes();
  };
  const loading = view === 'timeline' ? patient.isLoading && !patient.data : labs.isLoading && !labs.data;
  const error = view === 'timeline' ? (!patient.data ? patient.error : null) : !labs.data ? labs.error : null;

  return (
    <ScreenContainer help="timeline"
      refreshControl={
        <RefreshControl
          refreshing={(patient.isLoading && !!patient.data) || (labs.isLoading && !!labs.data) || loadingIntakes}
          onRefresh={refresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('history.title')}
        </AppText>
        <AppText color="textMuted">{t('history.subtitle')}</AppText>
      </View>
      <SegmentedControl options={VIEWS} value={view} onChange={setView} getLabel={(v) => t(`history.views.${v}`)} />
      {view === 'timeline' && (
        <CategoryFilter options={FILTERS} value={filter} onChange={setFilter} getLabel={(f) => (f === 'all' ? t('history.all') : t(`history.types.${f}`))} />
      )}
      <CategoryFilter options={PERIODS} value={period} onChange={setPeriod} getLabel={(p) => t(`history.periods.${p}`)} />

      {view === 'timeline' && filter === 'all' && intakeError && (
        <ErrorState message={intakeError} onRetry={reloadIntakes} />
      )}
      {visibleIntakes.length > 0 && (
        <View style={styles.entries}>
          <AppText variant="heading">Saved symptom forms</AppText>
          <AppText color="textMuted">Saved on this device.</AppText>
          {visibleIntakes.map((entry) => <SavedIntakeCard key={entry.id} entry={entry} />)}
        </View>
      )}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={refresh} />}
      {view === 'timeline' && patient.data && <MedicalEventList
          events={events}
          onSelect={open}
          grouped
          emptyAction={{ label: t('hubs.records.uploadFirst'), onPress: () => router.push('/patient/upload-document') }}
        />}
      {view === 'trends' && labs.data && (
        <LabTrendsList series={series} onSelect={(s) => router.push({ pathname: '/patient/lab-trend', params: { id: s.id } })} />
      )}
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
