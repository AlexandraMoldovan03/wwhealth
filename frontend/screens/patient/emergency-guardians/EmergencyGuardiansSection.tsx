import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, ErrorState, ListRow, SectionHeader, tapFeedback } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { validateEmail } from '@/screens/auth/validation';
import { api } from '@/services/backend';
import { getErrorMessage } from '@/utils/errors';

const loadOverview = () => api.getEmergencyGuardians();

/**
 * Patient side: who can open my emergency passport (confirmed accounts only) + invite / revoke.
 * The link becomes active only when the invited account accepts (backend checks its confirmed email).
 */
export function EmergencyGuardiansSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const overview = useAsync(loadOverview, { refetchOnFocus: true });
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setBusyId(null);
      void overview.reload();
    }
  };

  const invite = async () => {
    const invalid = validateEmail(email);
    setEmailError(invalid);
    if (invalid) return;
    const ok = await run('invite', () => api.inviteEmergencyGuardian({ email: email.trim(), relation: relation.trim() }));
    if (ok) {
      setEmail('');
      setRelation('');
      tapFeedback('success');
    }
  };

  const guardians = overview.data?.guardians ?? [];

  return (
    <View style={styles.section}>
      <SectionHeader title={t('guardians.title')} />
      <AppText color="textMuted">{t('guardians.intro')}</AppText>

      {overview.error ? (
        <ErrorState message={overview.error} onRetry={overview.reload} />
      ) : guardians.length === 0 ? (
        !overview.isLoading && <AppText variant="caption" color="textMuted">{t('guardians.empty')}</AppText>
      ) : (
        <View style={styles.list}>
          {guardians.map((g, index) => (
            <ListRow
              key={g.id}
              icon={g.status === 'active' ? 'shield-checkmark-outline' : 'mail-outline'}
              iconColor={g.status === 'active' ? colors.success : colors.textMuted}
              title={g.guardianName || g.email}
              subtitle={[g.relation, g.guardianName ? g.email : null, t(`guardians.${g.status}`)].filter(Boolean).join(' · ')}
              enterIndex={index}
              right={
                <AppButton
                  title={t(g.status === 'active' ? 'guardians.revoke' : 'guardians.cancelInvite')}
                  variant="outline"
                  size="sm"
                  loading={busyId === g.id}
                  disabled={busyId !== null}
                  onPress={() => void run(g.id, () => api.revokeEmergencyGuardian(g.id))}
                />
              }
            />
          ))}
        </View>
      )}

      <AppCard style={styles.form}>
        <AppInput
          label={t('guardians.emailLabel')}
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          placeholder={t('auth.emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <AppInput
          label={t('guardians.relationLabel')}
          icon="people-outline"
          value={relation}
          onChangeText={setRelation}
          placeholder={t('guardians.relationPlaceholder')}
          maxLength={40}
        />
        <AppButton
          title={t('guardians.invite')}
          icon="person-add-outline"
          variant="secondary"
          fullWidth
          loading={busyId === 'invite'}
          disabled={busyId !== null}
          onPress={() => void invite()}
        />
      </AppCard>
      {error && <ErrorState message={error} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.sm },
  form: { gap: spacing.md },
});
