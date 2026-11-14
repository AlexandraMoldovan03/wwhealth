import { router } from 'expo-router';

import { AppButton, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { ProfileSections } from '@/screens/shared/components/ProfileSections';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

export function MedicalProfileScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });


  return (
    <ScreenContainer edges={['bottom']}>
      {isLoading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <AppButton title={t('profile.edit')} icon="create-outline" variant="secondary" fullWidth onPress={() => router.push('/patient/edit-profile')} />
          <ProfileSections profile={data} />
        </>
      )}
    </ScreenContainer>
  );
}
