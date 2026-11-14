import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';

/**
 * What this doctor may see of the `[id]` patient, re-checked by the backend on every open / focus.
 * Without valid consent the view carries only a status (none / expired / revoked / forbidden) and no data.
 */
export function useDoctorPatient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => api.openDoctorPatient(id ?? ''), [id]);
  const { data, isLoading, error, reload } = useAsync(load, { refetchOnFocus: true });
  return { patientId: id ?? '', view: data, isLoading, error, reload };
}
