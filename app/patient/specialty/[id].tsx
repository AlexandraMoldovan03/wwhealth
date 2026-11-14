// Route "/patient/specialty/:id" → verified doctors of a specialty with free slots.
import { useLocalSearchParams } from 'expo-router';

import { SpecialtyDoctorsScreen } from '@/screens/patient/smart-care';

export default function SpecialtyDoctorsRoute() {
  const { id, name, fromCare } = useLocalSearchParams<{ id: string; name?: string; fromCare?: string }>();
  return <SpecialtyDoctorsScreen id={id} name={name || undefined} fromCare={fromCare === 'true'} />;
}
