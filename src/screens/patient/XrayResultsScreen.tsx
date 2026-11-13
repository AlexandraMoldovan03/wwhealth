import { router, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/components/ui';
import { XrayList } from '@/features/lungvision/components/XrayList';
import { XrayResultCard } from '@/features/lungvision/components/XrayResultCard';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';

/** X-ray Results — selected analysis (?id=…) or the latest, plus the full list. */
export function XrayResultsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);

  if (isLoading) return <ScreenContainer edges={['bottom']}><LoadingState /></ScreenContainer>;
  if (error || !data) return <ScreenContainer edges={['bottom']}><ErrorState message={error ?? undefined} onRetry={reload} /></ScreenContainer>;

  const selected = data.xrays.find((x) => x.id === id) ?? data.xrays[0];

  return (
    <ScreenContainer edges={['bottom']}>
      {selected ? (
        <XrayResultCard result={selected} />
      ) : (
        <EmptyState icon="scan-outline" title="No X-ray results" actionLabel="Analyze an X-ray" onAction={() => router.navigate('/analysis')} />
      )}
      {data.xrays.length > 1 && (
        <>
          <SectionHeader title="All analyses" />
          <XrayList xrays={data.xrays} onSelect={(x) => router.setParams({ id: x.id })} />
        </>
      )}
    </ScreenContainer>
  );
}
