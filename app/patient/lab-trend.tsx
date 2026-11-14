// Route "/patient/lab-trend?id=<analysis|unit>" → evolution of one lab analysis over time.
import { useLocalSearchParams } from 'expo-router';

import { LabTrendScreen } from '@/screens/patient/LabTrendScreen';

export default function LabTrendRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LabTrendScreen seriesId={id ?? ''} />;
}
