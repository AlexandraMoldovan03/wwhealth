import { Link, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, ErrorState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { login } from '@/features/auth/authService';
import { AuthHeader } from '@/features/auth/components/AuthHeader';
import { useSubmit } from '@/hooks/useSubmit';

export function LoginScreen() {
  const submit = useSubmit(login);

  const onSubmit = async () => {
    const res = await submit.run();
    if (res) router.replace(res.user.role === 'doctor' ? '/doctor' : '/');
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <AuthHeader title="Welcome back" subtitle="Sign in to access your medical record." />
      {submit.error && <ErrorState title="Sign in failed" message={submit.error} />}
      <AppButton title="Sign in" icon="log-in-outline" fullWidth loading={submit.isLoading} onPress={onSubmit} />
      <View style={styles.footer}>
        <AppText color="textMuted">Don’t have an account?</AppText>
        <Link href="/register" replace>
          <AppText variant="subheading" color="primary">Create one</AppText>
        </Link>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
});