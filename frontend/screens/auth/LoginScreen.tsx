import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/design-system';
import { SUPABASE_ENABLED } from '@/config/config';
import { spacing } from '@/design-system/theme';
import { login } from '@/services/auth/authService';
import { mfaPendingNow } from '@/services/security/mfa';
import { AuthHeader } from './components/AuthHeader';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { PasswordInput } from './components/PasswordInput';
import { isValid, validateEmail, validateRequired } from './validation';
import { useSubmit } from '@/hooks/useSubmit';
import { useTranslation } from 'react-i18next';

/** Login — UI only. The real logic goes in `frontend/services/auth/authService.ts → login()`. */
export function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmit(login);

  const errors = { email: validateEmail(email), password: validateRequired(password, t('common.password')) };

  const onSubmit = async () => {
    setShowErrors(true);
    if (!isValid(errors)) return;
    const res = await submit.run({ email: email.trim().toLowerCase(), password });
    // Accounts with two-step verification enter their code first; Home shows the role's dashboard.
    if (res) router.replace((await mfaPendingNow()) ? '/security/mfa-challenge' : '/');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer edges={['top', 'bottom']}>
        <AuthHeader title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} />

        <AppCard style={styles.form} enterIndex={1}>
          <AppInput
            label={t('common.email')}
            icon="mail-outline"
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            error={showErrors ? errors.email : undefined}
          />
          <PasswordInput
            label={t('common.password')}
            placeholder={t('auth.login.passwordPlaceholder')}
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
            error={showErrors ? errors.password : undefined}
          />
        </AppCard>

        {submit.error && <ErrorState compact title={t('auth.login.failed')} message={submit.error} />}
        <AppButton title={t('common.signIn')} trailingIcon="arrow-forward" fullWidth loading={submit.isLoading} onPress={onSubmit} />
        <GoogleSignInButton />

        <View style={styles.footer}>
          <AppText color="textMuted">{t('auth.login.noAccount')}</AppText>
          <Link href="/register" replace>
            <AppText variant="subheading" color="primary">
              {t('auth.login.createOne')}
            </AppText>
          </Link>
        </View>

        {!SUPABASE_ENABLED && <DemoNotice message={t('auth.login.demo')} />}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.md },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});
