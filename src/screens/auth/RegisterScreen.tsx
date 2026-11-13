import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/components/ui';
import { iconSize, spacing } from '@/constants/theme';
import { register } from '@/features/auth/authService';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { RoleSelector } from '@/features/auth/components/RoleSelector';
import { isValid, MIN_PASSWORD_LENGTH, validateEmail, validatePassword, validateRequired } from '@/features/auth/validation';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/hooks/useTheme';
import type { UserRole } from '@/types';

/** Register — UI only. The real logic goes in `src/features/auth/authService.ts → register()`. */
export function RegisterScreen() {
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmit(register);

  const errors = {
    fullName: validateRequired(fullName, 'Full name'),
    email: validateEmail(email),
    password: validatePassword(password),
    confirm: confirm !== password ? 'Passwords do not match' : undefined,
    terms: acceptedTerms ? undefined : 'You must accept the terms',
  };
  const err = (key: keyof typeof errors) => (showErrors ? errors[key] : undefined);

  const onSubmit = async () => {
    setShowErrors(true);
    if (!isValid(errors)) return;
    const res = await submit.run({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password, role });
    if (res) router.replace(res.user.role === 'doctor' ? '/doctor' : '/');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer edges={['bottom']}>
        <AuthHeader title="Create your account" subtitle="Your health record, available anywhere in the world." />

        <View style={styles.form}>
          <RoleSelector value={role} onChange={setRole} />
          <AppInput
            label="Full name"
            icon="person-outline"
            placeholder="Maria Ionescu"
            autoComplete="name"
            textContentType="name"
            value={fullName}
            onChangeText={setFullName}
            error={err('fullName')}
          />
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
            error={err('email')}
          />
          <PasswordInput
            label="Password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            error={err('password')}
          />
          <PasswordInput
            label="Confirm password"
            placeholder="Repeat your password"
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
              I agree to the Terms of Service and to the processing of my health data (GDPR).
            </AppText>
          </Pressable>
          {err('terms') && (
            <AppText variant="caption" color="danger">
              {err('terms')}
            </AppText>
          )}
        </View>

        {submit.error && <ErrorState title="Registration failed" message={submit.error} />}
        <AppButton title="Create account" icon="person-add-outline" fullWidth loading={submit.isLoading} onPress={onSubmit} />

        <View style={styles.footer}>
          <AppText color="textMuted">Already have an account?</AppText>
          <Link href="/login" replace>
            <AppText variant="subheading" color="primary">
              Sign in
            </AppText>
          </Link>
        </View>

        <DemoNotice message="DEMO — registration is not connected yet. No account is created." />
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
