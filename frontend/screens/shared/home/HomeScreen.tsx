import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { LoadingState } from '@/design-system';
import { SUPABASE_ENABLED } from '@/config/config';
import { refreshCurrentUser } from '@/services/auth/authService';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { isOnboarded } from '@/screens/shared/onboarding/onboardingStorage';
import { DoctorDashboardScreen } from '@/screens/doctor/dashboard/DoctorDashboardScreen';
import { PatientDashboardScreen } from '@/screens/patient/dashboard/PatientDashboardScreen';

/** Home tab: the dashboard of the role stored in Supabase (public.profiles.role). */
export function HomeScreen() {
  const user = useCurrentUser();
  const role = user?.role ?? 'patient';

  // Picks up a role changed by an admin in Supabase without signing out.
  useFocusEffect(
    useCallback(() => {
      void refreshCurrentUser();
    }, []),
  );

  // First sign-in on this device → short onboarding (skippable, reopenable from Profile).
  useEffect(() => {
    if (!user) return;
    let active = true;
    void isOnboarded(user.id).then((done) => {
      if (active && !done) router.push('/onboarding');
    });
    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in but the role is still loading → wait, so a doctor never mounts (and fetches) the patient dashboard.
  if (SUPABASE_ENABLED && !user) return <LoadingState />;
  return role === 'doctor' ? <DoctorDashboardScreen inTab /> : <PatientDashboardScreen />;
}
