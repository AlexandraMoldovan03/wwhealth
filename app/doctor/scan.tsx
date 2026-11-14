// Route "/doctor/scan" (old QR passport scanner) → replaced by the consent-based patients list.
import { Redirect } from 'expo-router';

export default function DoctorScanRedirect() {
  return <Redirect href="/patients" />;
}
