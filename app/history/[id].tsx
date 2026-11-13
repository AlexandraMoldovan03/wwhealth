// Route "/history/:id" → medical event detail (stack, on top of the tabs).
import { useLocalSearchParams } from 'expo-router';

import { MedicalEventDetailScreen } from '@/screens/patient/MedicalEventDetailScreen';

export default function MedicalEventDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MedicalEventDetailScreen id={id} />;
}
