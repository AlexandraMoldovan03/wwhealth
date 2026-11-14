// Route "/patient/import/:id" → Smart Import preview (check, edit, confirm or reject before anything is saved).
import { useLocalSearchParams } from 'expo-router';

import { ImportPreviewScreen } from '@/screens/patient/smart-import';

export default function ImportPreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ImportPreviewScreen id={id} />;
}
