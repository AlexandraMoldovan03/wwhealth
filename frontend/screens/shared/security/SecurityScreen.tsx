import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ErrorState, ScreenContainer, SectionHeader } from '@/design-system';
import { SUPABASE_ENABLED } from '@/config/config';
import { radius, spacing } from '@/design-system/theme';
import { PasswordInput } from '@/screens/auth/components/PasswordInput';
import { changePassword, hasPasswordIdentity, logout } from '@/services/auth/authService';
import {
  authenticateLocally,
  getBiometricSupport,
  isBiometricLockEnabled,
  isExpoGo,
  setBiometricLockEnabled,
  type BiometricSupport,
} from '@/services/security/biometrics';
import { confirmSensitiveAction, reasons } from '@/services/security/sensitiveAction';
import { SettingsRow } from '../settings/components/SettingsRow';

const errorText = (e: unknown, t: (k: string) => string) =>
  e && typeof e === 'object' && 'userMessage' in e ? String((e as { userMessage: string }).userMessage) : e instanceof Error ? e.message : t('errors.generic');

/** Settings → Security: biometric lock, password, sessions. */
export function SecurityScreen() {
  const { t } = useTranslation();
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [lockOn, setLockOn] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    void getBiometricSupport().then(setSupport);
    void isBiometricLockEnabled().then(setLockOn);
    if (SUPABASE_ENABLED) {
      void hasPasswordIdentity().then(setHasPassword);
    }
  }, []);
  useFocusEffect(load);

  const toggleLock = async (on: boolean) => {
    setError(null);
    // Turning it on (or off) needs a successful check first, so nobody else can change it on an unlocked phone.
    const result = await authenticateLocally(reasons.lock());
    if (result !== 'success') {
      if (result === 'unavailable') setError(t('security.biometric.unavailable'));
      return;
    }
    await setBiometricLockEnabled(on);
    setLockOn(on);
  };

  const submitPassword = async () => {
    setPwMessage(null);
    setError(null);
    if (pw.next.length < 8) return setPwMessage(t('auth.errors.weakPassword'));
    if (pw.next !== pw.confirm) return setPwMessage(t('security.password.mismatch'));
    setBusy('pw');
    try {
      await confirmSensitiveAction(reasons.password());
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwMessage(t('security.password.changed'));
    } catch (e) {
      setPwMessage(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  const signOutEverywhere = () =>
    Alert.alert(t('security.sessions.allTitle'), t('security.sessions.allBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('security.sessions.all'), style: 'destructive', onPress: async () => { await logout({ everywhere: true }); router.replace('/login'); } },
    ]);

  const kindLabel = support ? t(`security.biometric.kind.${support.kind}`) : '';

  return (
    <ScreenContainer showBackgroundLungs={false}>
      <AppText variant="title" accessibilityRole="header">
        {t('security.title')}
      </AppText>
      {error && <ErrorState compact title={t('security.errorTitle')} message={error} />}

      <View style={styles.section}>
        <SectionHeader title={t('security.biometric.title')} />
        <AppCard style={styles.group}>
          <SettingsRow
            icon="finger-print-outline"
            title={t('security.biometric.toggle', { kind: kindLabel })}
            right={
              <Switch
                value={lockOn}
                disabled={Platform.OS === 'web' || !support?.available}
                onValueChange={(on) => void toggleLock(on)}
                accessibilityLabel={t('security.biometric.toggle', { kind: kindLabel })}
              />
            }
          />
          <AppText variant="caption" color="textMuted" style={styles.note}>
            {Platform.OS === 'web' ? t('security.biometric.web') : support && !support.available ? t('security.biometric.unavailable') : t('security.biometric.explain')}
          </AppText>
          {isExpoGo && Platform.OS === 'ios' && (
            <AppText variant="caption" color="warning" style={styles.note}>
              {t('security.biometric.expoGo')}
            </AppText>
          )}
        </AppCard>
      </View>

      {SUPABASE_ENABLED && hasPassword && (
        <View style={styles.section}>
          <SectionHeader title={t('security.password.title')} />
          <AppCard style={[styles.group, styles.card]}>
            <PasswordInput label={t('security.password.current')} autoComplete="current-password" textContentType="password"
              value={pw.current} onChangeText={(current) => setPw((p) => ({ ...p, current }))} />
            <PasswordInput label={t('security.password.new')} autoComplete="new-password" textContentType="newPassword"
              value={pw.next} onChangeText={(next) => setPw((p) => ({ ...p, next }))} />
            <PasswordInput label={t('security.password.confirm')} autoComplete="new-password" textContentType="newPassword"
              value={pw.confirm} onChangeText={(confirm) => setPw((p) => ({ ...p, confirm }))} />
            {pwMessage && <AppText variant="caption" color="textMuted">{pwMessage}</AppText>}
            <AppButton title={t('security.password.change')} loading={busy === 'pw'} disabled={!pw.current || !pw.next}
              onPress={() => void submitPassword()} />
          </AppCard>
        </View>
      )}

      {SUPABASE_ENABLED && (
        <View style={styles.section}>
          <SectionHeader title={t('security.sessions.title')} />
          <AppCard style={styles.group}>
            <SettingsRow icon="phone-portrait-outline" title={t('security.sessions.all')} onPress={signOutEverywhere} />
            <AppText variant="caption" color="textMuted" style={styles.note}>
              {t('security.sessions.explain')}
            </AppText>
          </AppCard>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  group: { borderRadius: radius.xl, paddingVertical: spacing.xs },
  card: { gap: spacing.md, paddingVertical: spacing.md },
  note: { paddingVertical: spacing.sm },
});
