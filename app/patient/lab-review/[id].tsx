// Route "/patient/lab-review/:id?extract=1" → review / edit / delete the lab values of a document.
import { useLocalSearchParams } from 'expo-router';

import { LabReviewScreen } from '@/screens/patient/lab-results';

export default function LabReviewRoute() {
  const { id, extract } = useLocalSearchParams<{ id: string; extract?: string }>();
  return <LabReviewScreen id={id} extract={extract === '1'} />;
}
