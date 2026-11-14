import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, ErrorState } from '@/components/ui';
import { SUPABASE_ENABLED } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { signInWithGoogle } from '@/features/auth/authService';
import { useTheme } from '@/hooks/useTheme';
import { useSubmit } from '@/hooks/useSubmit';
import { useTranslation } from 'react-i18next';

/** "or" divider + "Continue with Google". Hidden in demo mode (no Supabase). */
export function GoogleSignInButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const submit = useSubmit(signInWithGoogle);
  if (!SUPABASE_ENABLED) return null;

  const onPress = async () => {
    const res = await submit.run();
    if (res) router.replace('/'); // Home shows the dashboard of the role from Supabase
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <AppText variant="caption" color="textMuted">
          {t('common.or')}
        </AppText>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      {submit.error && <ErrorState title={t('auth.google.failed')} message={submit.error} />}
      <AppButton title={t('auth.google.button')} icon="logo-google" variant="outline" fullWidth loading={submit.isLoading} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
