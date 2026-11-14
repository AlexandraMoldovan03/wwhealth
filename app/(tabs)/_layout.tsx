/** BOTTOM TABS — tab list (per role) lives in src/constants/navigation.ts. */
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/components/navigation/AppTabBar';
import { TABS } from '@/constants/navigation';
import { useRole } from '@/features/auth/useCurrentUser';
import { useSignedIn } from '@/features/auth/useSignedIn';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { colors } = useTheme();
  const signedIn = useSignedIn();
  const { t } = useTranslation();
  const role = useRole();

  // Don't mount the tabs (they fetch /patients/me) before the saved session is restored → no token-less 401.
  if (signedIn === null) return null;
  if (!signedIn) return <Redirect href="/login" />;

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
            title: t(`tabs.${tab.name}`, { defaultValue: tab.title }),
          }}
        />
      ))}
    </Tabs>
  );
}

