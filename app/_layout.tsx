/**
 * ROOT LAYOUT — wraps the whole app.
 * - Providers (theme, future auth/query providers) go here.
 * - The root Stack lists screens that open ON TOP of the tabs (detail pages, modals).
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, useRouter, useSegments } from 'expo-router';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import '@/i18n'; // initialises i18next before any screen renders
import { STACK_SCREENS } from '@/config/navigation';
import { fonts } from '@/design-system/theme';
import { ThemeProvider } from '@/design-system/ThemeContext';
import { HelpProvider } from '@/help';
import { EmergencyTokenProvider } from '@/services/EmergencyTokenProvider';
import { useSignedIn } from '@/services/auth/useSignedIn';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

/** With Supabase configured, every screen except Login / Register needs a session. */
function useAuthGuard() {
  const segments = useSegments();
  const router = useRouter();
  const signedIn = useSignedIn(); // null = restoring the saved session

  useEffect(() => {
    if (signedIn === null) return;
    const onAuthScreen = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'auth';
    if (!signedIn && !onAuthScreen) router.replace('/login');
  }, [signedIn, segments, router]);
}

const SHEET_SCREENS = new Set(['patient/emergency', 'patient/upload-document', 'patient/edit-profile', 'patient/lab-review/[id]']);

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  useAuthGuard();

  // Keeps React Navigation's own colours (headers, backgrounds) in sync with our theme.
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text, fontFamily: fonts.headingSemi, fontSize: 17 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
          // Native push/pop on iOS; soft fade-slide elsewhere (fluid, reduce-motion aware on native).
          animation: 'default',
          // iOS: swipe back from anywhere on the screen, not only the left edge.
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        {STACK_SCREENS.filter((s) => s.name !== 'login' && s.name !== 'register').map((screen) => (
          <Stack.Screen
            key={screen.name}
            name={screen.name}
            options={{
              title: t(`screens.${screen.name}`, { defaultValue: screen.title }),
              // Short, focused tasks open as an iOS sheet (swipe down to close).
              ...(SHEET_SCREENS.has(screen.name) && { presentation: 'modal' as const }),
              ...(screen.name === 'patient/import/[id]' && { presentation: 'modal' as const }),
            }}
          />
        ))}
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_600SemiBold,
    Inter_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  // Fonts are bundled (no network); falls back to the system font if loading fails.
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider>
      <EmergencyTokenProvider>
        <HelpProvider>
          <RootNavigator />
        </HelpProvider>
      </EmergencyTokenProvider>
    </ThemeProvider>
  );
}
