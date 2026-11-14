// Route "/patient/document/:id" → view an uploaded document (PDF / image).
import { useLocalSearchParams } from 'expo-router';

import { DocumentViewerScreen } from '@/screens/patient/DocumentViewerScreen';

export default function DocumentViewerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentViewerScreen id={id} />;
}
