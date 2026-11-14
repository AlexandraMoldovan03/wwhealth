import { router } from 'expo-router';

import { EmptyState } from '@/design-system';
import { DocumentList } from '@/screens/shared/components/DocumentList';
import { useTranslation } from 'react-i18next';

import { PatientGate } from './components/PatientGate';

/** Patient Documents (doctor view) — only with the 'documents' section shared. */
export function PatientDocumentsScreen() {
  const { t } = useTranslation();
  return (
    <PatientGate>
      {(view) =>
        view.documents === null ? (
          <EmptyState icon="lock-closed-outline" title={t('consent.summary.notShared')} message={t('consent.doctor.documentsNotShared')} />
        ) : (
          <DocumentList
            documents={view.documents}
            onSelect={(doc) => router.push({ pathname: '/doctor/patient/[id]/document/[docId]', params: { id: view.patientId, docId: doc.id } })}
          />
        )
      }
    </PatientGate>
  );
}
