/** BOTTOM TABS — tab list (per role) lives in frontend/config/navigation.ts. */
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/design-system/AppTabBar';
import { TABS } from '@/config/navigation';
import { useCurrentUser, useRole } from '@/services/auth/useCurrentUser';
import { useNeedsProfileSetup } from '@/services/profileSetup';
import { useSignedIn } from '@/services/auth/useSignedIn';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { colors } = useTheme();
  const signedIn = useSignedIn();
  const { t } = useTranslation();
  const role = useRole();
  const user = useCurrentUser();
  const needsSetup = useNeedsProfileSetup(signedIn && user?.role === 'patient' ? user.id : undefined);

  // Don't mount the tabs (they fetch /patients/me) before the saved session is restored → no token-less 401.
  if (signedIn === null) return null;
  if (!signedIn) return <Redirect href="/login" />;
  // New patient accounts fill in name, birth date and sex first.
  if (needsSetup) return <Redirect href="/patient/setup" />;

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        animation: 'shift',
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            // Each role gets its own navigation; hidden tabs stay protected by the backend anyway.
            href: tab.roles.includes(role) ? undefined : null,
            title: t(`tabs.${role}.${tab.name}`, { defaultValue: t(`tabs.${tab.name}`, { defaultValue: tab.title }) }),
          }}
        />
      ))}
    </Tabs>
  );
}

