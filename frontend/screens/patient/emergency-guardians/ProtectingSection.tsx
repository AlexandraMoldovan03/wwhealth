import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, ErrorState, ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { type UseAsyncResult, useAsync } from '@/hooks/useAsync';
import { api } from '@/services/backend';
import type { GuardianOverview } from '@/types';
import { getErrorMessage } from '@/utils/errors';

const loadOverview = () => api.getEmergencyGuardians();

type Overview = Pick<UseAsyncResult<GuardianOverview>, 'data' | 'error' | 'isLoading' | 'reload'>;

/**
 * Guardian side: invitations sent to my confirmed email + "I am an emergency contact for…".
 * Renders nothing when the signed-in account has neither (most accounts).
 */
/** `overview`: shared loader (Family tab); `showEmpty`: explain where invitations appear instead of rendering nothing. */
export function ProtectingSection({ overview: shared, showEmpty = false }: { overview?: Overview; showEmpty?: boolean } = {}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const own = useAsync(loadOverview, { refetchOnFocus: !shared, immediate: !shared });
  const overview = shared ?? own;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (id: string, accept: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await api.respondEmergencyGuardian(id, accept);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
      void overview.reload();
    }
  };

  const invitations = overview.data?.invitations ?? [];
  const protecting = overview.data?.protecting ?? [];
  const loadError = overview.error;
  if (invitations.length === 0 && protecting.length === 0 && !error && !loadError) {
    return showEmpty && !overview.isLoading ? (
      <View style={styles.section}>
        <SectionHeader title={t('guardians.protectingTitle')} />
        <AppText variant="caption" color="textMuted">{t('guardians.noInvitations')}</AppText>
      </View>
    ) : null;
  }

  return (
    <View style={styles.wrap}>
      {invitations.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('guardians.invitationsTitle')} />
          {invitations.map((inv) => (
            <AppCard key={inv.id} style={styles.invite}>
              <AppText variant="subheading">
                {t('guardians.invitedBy', { name: inv.patientName || t('guardians.unnamed') })}
              </AppText>
              {!!inv.relation && <AppText variant="caption" color="textMuted">{inv.relation}</AppText>}
              <AppText variant="caption" color="textMuted">{t('guardians.protectingHint')}</AppText>
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <AppButton
                    title={t('guardians.decline')}
                    variant="outline"
                    size="sm"
                    fullWidth
                    disabled={busyId !== null}
                    onPress={() => void respond(inv.id, false)}
                  />
                </View>
                <View style={styles.flex}>
                  <AppButton
                    title={t('guardians.accept')}
                    icon="checkmark-circle-outline"
                    size="sm"
                    fullWidth
                    loading={busyId === inv.id}
                    disabled={busyId !== null}
                    onPress={() => void respond(inv.id, true)}
                  />
                </View>
              </View>
            </AppCard>
          ))}
        </View>
      )}

      {protecting.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={t('guardians.protectingTitle')} />
          {protecting.map((p, index) => (
            <ListRow
              key={p.id}
              icon="medkit-outline"
              iconColor={colors.danger}
              title={p.patientName || t('guardians.unnamed')}
              subtitle={[p.relation, t('guardians.open')].filter(Boolean).join(' · ')}
              enterIndex={index}
              onPress={() =>
                router.push({ pathname: '/patient/emergency-guardian/[patientId]', params: { patientId: p.patientId } })
              }
            />
          ))}
        </View>
      )}
      {error && <ErrorState message={error} />}
      {loadError && <ErrorState message={loadError} onRetry={overview.reload} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  section: { gap: spacing.sm },
  invite: { gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
});
