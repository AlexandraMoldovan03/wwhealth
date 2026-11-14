import { router } from 'expo-router';
import { Alert, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { AccessEvent, DoctorGrant } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

import { GrantStatusBadge, ScopeBadges } from '@/screens/shared/components/ConsentBadges';

const EVENT_ICON = {
  granted: 'shield-checkmark-outline',
  revoked: 'close-circle-outline',
  viewed: 'eye-outline',
  denied: 'lock-closed-outline',
} as const;

/**
 * "Doctor access" — the patient's consents: active (revocable now), ended, and every grant / view / denial.
 * The backend (RLS + security-definer functions) is the source of truth; this screen only displays it.
 * Separate from the Emergency Passport QR, which keeps its own 5-minute single-use rules.
 */
export function DoctorAccessScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getDoctorAccess, { refetchOnFocus: true });
  const revoke = useSubmit(api.revokeDoctorAccess);

  const active = data?.grants.filter((g) => g.status === 'active') ?? [];
  const ended = data?.grants.filter((g) => g.status !== 'active') ?? [];

  const confirmRevoke = (g: DoctorGrant) => {
    const title = t('consent.revokeTitle');
    const message = t('consent.revokeMessage', { doctor: g.doctorName ?? g.doctorCode ?? '' });
    const doRevoke = async () => {
      await revoke.run(g.id);
      await reload();
    };
    // react-native-web has no Alert dialog.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n${message}`)) void doRevoke();
      return;
    }
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('consent.revoke'), style: 'destructive', onPress: () => void doRevoke() },
    ]);
  };

  const eventTitle = (e: AccessEvent) =>
    t(`consent.events.${e.event}`, { doctor: e.doctorName ?? t('consent.unknownDoctor') });
  const eventDetail = (e: AccessEvent) =>
    [
      formatDateTime(e.createdAt),
      e.section ? t(`consent.sections.${e.section}`, { defaultValue: e.section }) : null,
      e.reason ? t(`consent.reasons.${e.reason}`, { defaultValue: e.reason }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ScreenContainer help="doctorAccess" edges={['bottom']} refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <AppText color="textMuted">{t('consent.intro')}</AppText>
      <AppButton title={t('consent.grantCta')} icon="person-add-outline" fullWidth onPress={() => router.push('/patient/grant-access')} />
      <ListRow
        icon="reader-outline"
        iconColor={colors.info}
        title={t('consent.previewSummary')}
        subtitle={t('consent.previewSummaryHint')}
        onPress={() => router.push('/patient/summary')}
      />

      {isLoading && !data && <LoadingState count={2} />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {revoke.error && <ErrorState compact message={revoke.error} />}

      {data && (
        <>
          <View style={styles.section}>
            <SectionHeader title={t('consent.active')} />
            {active.length === 0 ? (
              <EmptyState icon="shield-outline" title={t('consent.noActive')} message={t('consent.noActiveHint')} />
            ) : (
              active.map((g, i) => (
                <AppCard key={g.id} enterIndex={i} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <AppText variant="subheading">{g.doctorName ?? t('consent.unknownDoctor')}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {[g.doctorCode, t('consent.until', { date: formatDateTime(g.expiresAt) })].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    <GrantStatusBadge status={g.status} />
                  </View>
                  <ScopeBadges scopes={g.scopes} />
                  <AppButton
                    title={t('consent.revoke')}
                    icon="close-circle-outline"
                    variant="outline"
                    size="sm"
                    loading={revoke.isLoading}
                    onPress={() => confirmRevoke(g)}
                  />
                </AppCard>
              ))
            )}
          </View>

          {ended.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t('consent.ended')} />
              {ended.map((g) => (
                <ListRow
                  key={g.id}
                  icon="person-outline"
                  title={g.doctorName ?? t('consent.unknownDoctor')}
                  subtitle={`${g.scopes.map((s) => t(`consent.scopes.${s}`)).join(', ')} · ${formatDateTime(g.revokedAt ?? g.expiresAt)}`}
                  right={<GrantStatusBadge status={g.status} />}
                />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader title={t('consent.history')} subtitle={t('consent.historyHint')} />
            {data.events.length === 0 ? (
              <AppCard>
                <AppText color="textMuted">{t('consent.noHistory')}</AppText>
              </AppCard>
            ) : (
              data.events.map((e) => (
                <ListRow
                  key={e.id}
                  icon={EVENT_ICON[e.event]}
                  iconColor={e.event === 'denied' || e.event === 'revoked' ? colors.danger : e.event === 'viewed' ? colors.info : colors.success}
                  title={eventTitle(e)}
                  subtitle={eventDetail(e)}
                />
              ))
            )}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
