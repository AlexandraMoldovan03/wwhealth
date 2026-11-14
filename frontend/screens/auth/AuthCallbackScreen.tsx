import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppButton, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { completeOAuthSignIn } from '@/services/auth/authService';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

/** Landing page after Google: exchanges the one-time code for a session, then opens the app. */
export function AuthCallbackScreen() {
  const url = Linking.useURL();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let active = true;
    completeOAuthSignIn(url)
      .then(() => active && router.replace('/')) // Home picks the dashboard by role
      .catch((err: unknown) => active && setError(getErrorMessage(err)));
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <ScreenContainer>
      {error ? (
        <>
          <ErrorState title={t('auth.google.failed')} message={error} />
          <AppButton title={t('auth.google.backToSignIn')} variant="outline" fullWidth onPress={() => router.replace('/login')} />
        </>
      ) : (
        <LoadingState message={t('auth.google.signingIn')} />
      )}
    </ScreenContainer>
  );
}
