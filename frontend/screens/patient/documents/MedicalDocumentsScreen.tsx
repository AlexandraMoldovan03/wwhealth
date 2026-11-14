import { router } from 'expo-router';

import { AppButton, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { DocumentList } from '@/screens/shared/components/DocumentList';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

export function MedicalDocumentsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });


  return (
    <ScreenContainer help="documents" edges={['bottom']}>
      <AppButton title={t('documents.upload')} icon="cloud-upload-outline" fullWidth onPress={() => router.push('/patient/upload-document')} />
      {isLoading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <DocumentList
          documents={data.documents}
          onSelect={(doc) => router.push({ pathname: '/patient/document/[id]', params: { id: doc.id } })}
        />
      )}
    </ScreenContainer>
  );
}
