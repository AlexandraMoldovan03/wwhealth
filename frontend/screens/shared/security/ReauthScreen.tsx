import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ErrorState, IconBadge, ScreenContainer } from '@/design-system';
import { PasswordInput } from '@/screens/auth/components/PasswordInput';
import { hasPasswordIdentity, reauthenticateWithPassword, signInWithGoogle } from '@/services/auth/authService';
import { useCurrentUser } from '@/services/auth/useCurrentUser';

/**
 * "Confirm it's you" before a high-risk action: a real sign-in (password or Google). Face ID alone is not
 * enough here — the server needs a fresh sign-in time.
 */
export function ReauthScreen() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const [password, setPassword] = useState('');
  const [usesPassword, setUsesPassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hasPasswordIdentity().then(setUsesPassword);
  }, []);

  const finish = async () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const withPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      await reauthenticateWithPassword(password);
      setPassword('');
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await signInWithGoogle()) await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer>
      <IconBadge icon="key-outline" size={64} />
      <AppText variant="title" accessibilityRole="header">
        {t('security.reauth.title')}
      </AppText>
      <AppText color="textMuted">{t('security.reauth.subtitle')}</AppText>
      {user?.email && (
        <AppText variant="subheading" selectable>
          {user.email}
        </AppText>
      )}
      {usesPassword ? (
        <>
          <AppCard>
            <PasswordInput label={t('common.password')} autoComplete="current-password" textContentType="password"
              value={password} onChangeText={setPassword} onSubmitEditing={() => void withPassword()} returnKeyType="go" />
          </AppCard>
          {error && <ErrorState compact title={t('security.errorTitle')} message={error} />}
          <AppButton title={t('security.reauth.confirm')} fullWidth loading={busy} disabled={!password} onPress={() => void withPassword()} />
        </>
      ) : (
        <>
          {error && <ErrorState compact title={t('security.errorTitle')} message={error} />}
          <AppButton title={t('security.reauth.google')} icon="logo-google" fullWidth loading={busy} onPress={() => void withGoogle()} />
        </>
      )}
      <AppButton title={t('common.cancel')} variant="ghost" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </ScreenContainer>
  );
}
