import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { AppButton, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { DocumentList } from '@/features/documents/components/DocumentList';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';

export function MedicalDocumentsScreen() {
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);

  // Refresh when coming back from Upload Document.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <ScreenContainer edges={['bottom']}>
      <AppButton title="Upload document" icon="cloud-upload-outline" fullWidth onPress={() => router.push('/patient/upload-document')} />
      {isLoading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <DocumentList documents={data.documents} />}
    </ScreenContainer>
  );
}
