import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/components/ui';
import { SUPABASE_ENABLED } from '@/constants/config';
import { iconSize, spacing } from '@/constants/theme';
import { register } from '@/features/auth/authService';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { isValid, MIN_PASSWORD_LENGTH, validateEmail, validatePassword, validateRequired } from '@/features/auth/validation';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';

/** Register — UI only. The real logic goes in `src/features/auth/authService.ts → register()`. */
export function RegisterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmit(register);

  const errors = {
    fullName: validateRequired(fullName, t('auth.register.fullName')),
    email: validateEmail(email),
    password: validatePassword(password),
    confirm: confirm !== password ? t('auth.register.passwordsMismatch') : undefined,
    terms: acceptedTerms ? undefined : t('auth.register.mustAcceptTerms'),
  };
  const err = (key: keyof typeof errors) => (showErrors ? errors[key] : undefined);

  const onSubmit = async () => {
    setShowErrors(true);
    if (!isValid(errors)) return;
    const res = await submit.run({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password, role: 'patient' }); // doctor role is granted in Supabase only
    if (res) router.replace('/'); // Home shows the dashboard of the role from Supabase
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer edges={['top', 'bottom']}>
        <AuthHeader title={t('auth.register.title')} subtitle={t('auth.register.subtitle')} />

        <AppCard style={styles.form} enterIndex={1}>
          <AppInput
            label={t('auth.register.fullName')}
            icon="person-outline"
            placeholder="Maria Ionescu"
            autoComplete="name"
            textContentType="name"
            value={fullName}
            onChangeText={setFullName}
            error={err('fullName')}
          />
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
            error={err('email')}
          />
          <PasswordInput
            label={t('common.password')}
            placeholder={t('auth.register.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            error={err('password')}
          />
          <PasswordInput
            label={t('auth.register.confirmPassword')}
            placeholder={t('auth.register.confirmPlaceholder')}
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirm}
            onChangeText={setConfirm}
            error={err('confirm')}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            onPress={() => setAcceptedTerms((v) => !v)}
            style={styles.terms}
          >
            <Ionicons
              name={acceptedTerms ? 'checkbox' : 'square-outline'}
              size={iconSize.md}
              color={err('terms') ? colors.danger : acceptedTerms ? colors.primary : colors.textMuted}
            />
            <AppText variant="caption" color="textMuted" style={styles.flex}>
              {t('auth.register.terms')}
            </AppText>
          </Pressable>
          {err('terms') && (
            <AppText variant="caption" color="danger">
              {err('terms')}
            </AppText>
          )}
        </AppCard>
        <DemoNotice message={t('auth.register.doctorNote')} />

        {submit.error && <ErrorState compact title={t('auth.register.failed')} message={submit.error} />}
        <AppButton title={t('common.createAccount')} trailingIcon="arrow-forward" fullWidth loading={submit.isLoading} onPress={onSubmit} />
        <GoogleSignInButton />

        <View style={styles.footer}>
          <AppText color="textMuted">{t('auth.register.haveAccount')}</AppText>
          <Link href="/login" replace>
            <AppText variant="subheading" color="primary">
              {t('common.signIn')}
            </AppText>
          </Link>
        </View>

        {!SUPABASE_ENABLED && <DemoNotice message={t('auth.register.demo')} />}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.md },
  terms: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});
