// Route "/patient/book/:doctorId" → choose a free slot and send a booking request.
import { useLocalSearchParams } from 'expo-router';

import { BookAppointmentScreen } from '@/screens/patient/smart-care';

export default function BookAppointmentRoute() {
  const { doctorId, specialtyId, doctorName, specialtyName } = useLocalSearchParams<{ doctorId: string; specialtyId?: string; doctorName?: string; specialtyName?: string }>();
  return <BookAppointmentScreen doctorId={doctorId} specialtyId={specialtyId || undefined} doctorName={doctorName || undefined} specialtyName={specialtyName || undefined} />;
}
