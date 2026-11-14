// Route "/doctor/patient/:id/lungvision" (old QR flow) → X-rays are not a shared section; back to the summary.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DoctorLungVisionRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/doctor/patient/[id]', params: { id: id ?? '' } }} />;
}
