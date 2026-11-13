import { ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { ProfileSections } from '@/features/patient/components/ProfileSections';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';

export function MedicalProfileScreen() {
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);
  return (
    <ScreenContainer edges={['bottom']}>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <ProfileSections profile={data} />}
    </ScreenContainer>
  );
}
