/**
 * ROOT LAYOUT — wraps the whole app.
 * - Providers (theme, future auth/query providers) go here.
 * - The root Stack lists screens that open ON TOP of the tabs (detail pages, modals).
 * - Auth guard: logged-out users are sent to /login, logged-in users are kept out of it.
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { STACK_SCREENS } from '@/constants/navigation';
import { ThemeProvider } from '@/context/ThemeContext';
import { restoreSession } from '@/features/auth/authService';
import { useSession } from '@/features/auth/sessionStore';
import { useTheme } from '@/hooks/useTheme';

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { isAuthenticated, ready } = useSession();
  const segments = useSegments();
  const router = useRouter();

  // Restore a saved Auth0 session once, at app start.
  useEffect(() => {
    void restoreSession();
  }, []);

  // Redirect based on auth state (only after the saved session has been checked).
  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === 'login' || first === 'register';
    if (!isAuthenticated && !inAuth) {
      router.replace('/login');
    } else if (isAuthenticated && inAuth) {
      router.replace('/');
    }
  }, [ready, isAuthenticated, segments, router]);

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

  // Wait until we know whether a session exists (avoids a flash of the wrong screen).
  if (!ready) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          headerStyle: { backgroundColor: colors.surface },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {STACK_SCREENS.map((screen) => (
          <Stack.Screen key={screen.name} name={screen.name} options={{ title: screen.title }} />
        ))}
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}