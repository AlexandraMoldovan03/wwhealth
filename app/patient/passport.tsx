// Route "/patient/passport" (old QR passport) → replaced by Doctor access.
import { Redirect } from 'expo-router';

export default function PassportRedirect() {
  return <Redirect href="/patient/doctor-access" />;
}
