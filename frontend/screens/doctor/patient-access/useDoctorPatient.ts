import { useLocalSearchParams } from 'expo-router';

import { getDoctorSession } from './doctorSession';

/** Reads the unlocked patient for the `[id]` route param (null if access expired / missing). */
export function useDoctorPatient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = id ? getDoctorSession(id) : null;
  return { patientId: id, session, patient: session?.patient ?? null };
}
