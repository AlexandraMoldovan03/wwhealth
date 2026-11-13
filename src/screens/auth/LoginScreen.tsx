import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { login } from '@/features/auth/authService';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { isValid, validateEmail, validateRequired } from '@/features/auth/validation';
import { useSubmit } from '@/hooks/useSubmit';

/** Login — UI only. The real logic goes in `src/features/auth/authService.ts → login()`. */
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmit(login);

  const errors = { email: validateEmail(email), password: validateRequired(password, 'Password') };

  const onSubmit = async () => {
    setShowErrors(true);
    if (!isValid(errors)) return;
    const res = await submit.run({ email: email.trim().toLowerCase(), password });
    if (res) router.replace(res.user.role === 'doctor' ? '/doctor' : '/');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer edges={['bottom']}>
        <AuthHeader title="Welcome back" subtitle="Sign in to access your medical record." />

        <View style={styles.form}>
          <AppInput
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
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
            label="Password"
            placeholder="Your password"
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
            error={showErrors ? errors.password : undefined}
          />
          <AppButton
            title="Forgot password?"
            variant="ghost"
            size="sm"
            onPress={() => Alert.alert('Forgot password', 'TODO: implement password reset.')}
          />
        </View>

        {submit.error && <ErrorState title="Sign in failed" message={submit.error} />}
        <AppButton title="Sign in" icon="log-in-outline" fullWidth loading={submit.isLoading} onPress={onSubmit} />

        <View style={styles.footer}>
          <AppText color="textMuted">Don’t have an account?</AppText>
          <Link href="/register" replace>
            <AppText variant="subheading" color="primary">
              Create one
            </AppText>
          </Link>
        </View>

        <DemoNotice message="DEMO — login is not connected yet. Any email + password works." />
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.md },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});
