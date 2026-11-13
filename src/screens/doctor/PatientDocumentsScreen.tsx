import { ScreenContainer } from '@/components/ui';
import { DocumentList } from '@/features/documents/components/DocumentList';
import { NoAccessState } from '@/features/doctor/components/NoAccessState';
import { useDoctorPatient } from '@/features/doctor/useDoctorPatient';

/** Patient Documents (doctor view). Empty if the 'documents' scope wasn't granted. */
export function PatientDocumentsScreen() {
  const { patient } = useDoctorPatient();
  return (
    <ScreenContainer edges={['bottom']}>
      {patient ? <DocumentList documents={patient.documents} /> : <NoAccessState />}
    </ScreenContainer>
  );
}
