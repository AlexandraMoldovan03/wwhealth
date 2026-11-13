import { Link, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, ErrorState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { register } from '@/features/auth/authService';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { useSubmit } from '@/hooks/useSubmit';

/** Register — opens Auth0's hosted sign-up page. Accounts are patients by default. */
export function RegisterScreen() {
  const submit = useSubmit(register);

  const onSubmit = async () => {
    const res = await submit.run();
    if (res) router.replace(res.user.role === 'doctor' ? '/doctor' : '/');
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <AuthHeader title="Create your account" subtitle="Your health record, available anywhere in the world." />

      <AppText color="textMuted" style={styles.center}>
        You&apos;ll be taken to a secure page to enter your name, email and password.
      </AppText>

      {submit.error && <ErrorState title="Registration failed" message={submit.error} />}
      <AppButton title="Continue to sign up" icon="person-add-outline" fullWidth loading={submit.isLoading} onPress={onSubmit} />

      <View style={styles.footer}>
        <AppText color="textMuted">Already have an account?</AppText>
        <Link href="/login" replace>
          <AppText variant="subheading" color="primary">
            Sign in
          </AppText>
        </Link>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});