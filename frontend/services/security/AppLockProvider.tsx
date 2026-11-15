/**
 * Optional app lock (Settings → Security → Face ID / fingerprint).
 * Locks a restored session at launch and after ≥30 s in the background; unlock = Face ID / fingerprint, or the
 * device passcode. Without either, the only way in is signing in again with the password (secure fallback).
 * The lock is local only: it adds nothing on the server and never blocks the server-side checks.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText, IconBadge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { logout } from '@/services/auth/authService';
import { useSignedIn } from '@/services/auth/useSignedIn';
import { supabase } from '@/services/supabase';

import { authenticateLocally, isBiometricLockEnabled, subscribeBiometricLock } from './biometrics';
import { lockScreenAction, shouldLockOnLaunch, shouldLockOnResume } from './lockPolicy';
import { reasons } from './sensitiveAction';

export function AppLockProvider({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  // Cold start: lock only a session restored from storage (not one the user signs in to afterwards).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    void Promise.all([isBiometricLockEnabled(), supabase ? supabase.auth.getSession() : Promise.resolve(null)]).then(([on, res]) => {
      if (!alive) return;
      setEnabled(on);
      if (shouldLockOnLaunch({ enabled: on, signedIn: !!res?.data.session }, true)) setLocked(true);
    });
    const unsubscribe = subscribeBiometricLock((on) => {
      setEnabled(on);
      if (!on) setLocked(false); // turned off, or cleared at sign-out
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        if (shouldLockOnResume({ enabled, signedIn: !!signedIn, backgroundedAt: backgroundedAt.current, now: Date.now() }))
          setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled, signedIn]);

  return (
    <View style={styles.flex}>
      {children}
      {locked && signedIn !== false && <LockScreen onUnlock={() => setLocked(false)} />}
    </View>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [mustSignIn, setMustSignIn] = useState(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    const action = lockScreenAction(await authenticateLocally(reasons.lock()));
    setBusy(false);
    if (action === 'unlock') onUnlock();
    if (action === 'signInAgain') setMustSignIn(true);
  }, [onUnlock]);

  useEffect(() => {
    const timer = setTimeout(() => void unlock(), 0); // ask right away
    return () => clearTimeout(timer);
  }, [unlock]);

  const signOut = async () => {
    await logout();
    onUnlock();
    router.replace('/login');
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: colors.background }]} accessibilityViewIsModal>
      <IconBadge icon="lock-closed-outline" size={72} />
      <AppText variant="title" align="center" accessibilityRole="header">
        {t('security.lock.title')}
      </AppText>
      <AppText color="textMuted" align="center">
        {mustSignIn ? t('security.lock.unavailable') : t('security.lock.subtitle')}
      </AppText>
      {!mustSignIn && <AppButton title={t('security.lock.unlock')} icon="finger-print-outline" fullWidth loading={busy} onPress={() => void unlock()} />}
      <AppButton title={t('security.lock.signInAgain')} variant="ghost" fullWidth onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lock: { zIndex: 1000, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
});
