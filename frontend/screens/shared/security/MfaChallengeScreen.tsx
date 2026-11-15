import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, ErrorState, IconBadge, ScreenContainer } from '@/design-system';
import { logout } from '@/services/auth/authService';
import { completeMfaSignIn, MfaError } from '@/services/security/mfa';

/**
 * Sign-in step 2 for accounts with two-step verification. Until the code is accepted the session is aal1 and
 * neither the app nor the backend opens medical data. "Sign out" ends the incomplete session.
 */
export function MfaChallengeScreen() {
  const { t } = useTranslation();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeMfaSignIn(code);
      if (then === 'back' && router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setCode('');
      setError(t(e instanceof MfaError ? e.key : 'security.mfa.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <IconBadge icon="shield-checkmark-outline" size={64} />
      <AppText variant="title" accessibilityRole="header">
        {t('security.mfa.challengeTitle')}
      </AppText>
      <AppText color="textMuted">{t('security.mfa.challengeSubtitle')}</AppText>
      <AppCard>
        <AppInput
          label={t('security.mfa.code')}
          icon="keypad-outline"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={() => void verify()}
        />
      </AppCard>
      {error && <ErrorState compact title={t('security.errorTitle')} message={error} />}
      <AppButton title={t('security.mfa.verify')} fullWidth loading={busy} disabled={code.replace(/\D/g, '').length !== 6} onPress={() => void verify()} />
      <AppText variant="caption" color="textMuted">
        {t('security.mfa.lostDevice')}
      </AppText>
      <AppButton title={t('settings.signOut')} variant="ghost" fullWidth onPress={() => void signOut()} />
    </ScreenContainer>
  );
}
