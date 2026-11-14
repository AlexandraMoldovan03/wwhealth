import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppText, DemoNotice, ErrorState, ScreenContainer, SectionHeader } from '@/design-system';
import { USE_MOCKS } from '@/config/config';
import { radius, spacing } from '@/design-system/theme';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { AccessScope } from '@/types';
import { formatDateTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const SCOPES: AccessScope[] = ['profile', 'history', 'documents', 'xrays'];
const TTL_OPTIONS = ['15', '60', '240'] as const;

/** QR Medical Passport — POST /api/v1/access/grant → temporary token shown as QR. */
export function MedicalPassportScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [scopes, setScopes] = useState<AccessScope[]>(['profile', 'history', 'xrays']);
  const [ttl, setTtl] = useState<(typeof TTL_OPTIONS)[number]>('15');
  const grant = useSubmit(api.grantAccess);

  const toggle = (scope: AccessScope) =>
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));

  return (
    <ScreenContainer edges={['bottom']}>
      <AppText color="textMuted">{t('passport.intro')}</AppText>

      <View style={styles.section}>
        <SectionHeader title={t('passport.shared')} />
        <AppCard style={styles.list}>
          {SCOPES.map((s) => (
            <View key={s} style={styles.scopeRow}>
              <AppText style={styles.flex}>{t(`passport.scopes.${s}`)}</AppText>
              <Switch
                value={scopes.includes(s)}
                onValueChange={() => toggle(s)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('passport.validFor')} />
        <CategoryFilter options={TTL_OPTIONS} value={ttl} onChange={setTtl} />
      </View>

      <AppButton
        title={t('passport.generate')}
        icon="qr-code-outline"
        fullWidth
        disabled={scopes.length === 0}
        loading={grant.isLoading}
        onPress={() => void grant.run({ scopes, ttlMinutes: Number(ttl) })}
      />

      {grant.error && <ErrorState message={grant.error} />}
      {grant.data && (
        <AppCard style={styles.qrCard}>
          {/* TODO(mobile): render grant.data.qrPayload with react-native-qrcode-svg (+ react-native-svg). */}
          <View style={[styles.qrBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="qr-code" size={120} color={colors.text} />
            <AppText variant="caption" color="textMuted">
              {t('passport.qrPlaceholder')}
            </AppText>
          </View>
          <AppText variant="label" color="textMuted">
            {t('passport.accessCode')}
          </AppText>
          <AppText variant="title" selectable>
            {grant.data.token}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('passport.expires', { date: formatDateTime(grant.data.expiresAt) })} ·{' '}
            {grant.data.scopes.map((s) => t(`passport.scopes.${s}`)).join(', ')}
          </AppText>
        </AppCard>
      )}
      {USE_MOCKS && <DemoNotice message={t('passport.demo')} />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.sm },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  qrCard: { alignItems: 'center', gap: spacing.sm },
  qrBox: { width: 200, height: 200, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
