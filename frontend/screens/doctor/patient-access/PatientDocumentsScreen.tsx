import { ScreenContainer } from '@/design-system';
import { DocumentList } from '@/screens/shared/components/DocumentList';
import { NoAccessState } from './components/NoAccessState';
import { useDoctorPatient } from './useDoctorPatient';

/** Patient Documents (doctor view). Empty if the 'documents' scope wasn't granted. */
export function PatientDocumentsScreen() {
  const { patient } = useDoctorPatient();
  return (
    <ScreenContainer edges={['bottom']}>
      {patient ? <DocumentList documents={patient.documents} /> : <NoAccessState />}
    </ScreenContainer>
  );
}
