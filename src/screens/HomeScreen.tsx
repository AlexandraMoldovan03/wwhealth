import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { LoadingState } from '@/components/ui';
import { SUPABASE_ENABLED } from '@/constants/config';
import { refreshCurrentUser } from '@/features/auth/authService';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { isOnboarded } from '@/features/onboarding/onboardingStorage';
import { DoctorDashboardScreen } from '@/screens/doctor/DoctorDashboardScreen';
import { PatientDashboardScreen } from '@/screens/patient/PatientDashboardScreen';

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
