import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppText, DemoNotice, ErrorState, ScreenContainer, SectionHeader } from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { radius, spacing } from '@/constants/theme';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import type { AccessScope } from '@/types';
import { formatDateTime } from '@/utils/format';

const SCOPES: { value: AccessScope; label: string }[] = [
  { value: 'profile', label: 'Profile, allergies, diagnoses' },
  { value: 'history', label: 'Medical history' },
  { value: 'documents', label: 'Documents' },
  { value: 'xrays', label: 'LungVision X-rays' },
];
const TTL_OPTIONS = ['15', '60', '240'] as const;

/** QR Medical Passport — POST /api/v1/access/grant → temporary token shown as QR. */
export function MedicalPassportScreen() {
  const { colors } = useTheme();
  const [scopes, setScopes] = useState<AccessScope[]>(['profile', 'history', 'xrays']);
  const [ttl, setTtl] = useState<(typeof TTL_OPTIONS)[number]>('15');
  const grant = useSubmit(api.grantAccess);

  const toggle = (scope: AccessScope) =>
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));

  return (
    <ScreenContainer edges={['bottom']}>
      <AppText color="textMuted">Choose what the doctor can see and for how long. Access expires automatically.</AppText>

      <View style={styles.section}>
        <SectionHeader title="Shared data" />
        <AppCard style={styles.list}>
          {SCOPES.map((s) => (
            <View key={s.value} style={styles.scopeRow}>
              <AppText style={styles.flex}>{s.label}</AppText>
              <Switch
                value={scopes.includes(s.value)}
                onValueChange={() => toggle(s.value)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          ))}
        </AppCard>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Valid for (minutes)" />
        <CategoryFilter options={TTL_OPTIONS} value={ttl} onChange={setTtl} />
      </View>

      <AppButton
        title="Generate QR passport"
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
              QR placeholder
            </AppText>
          </View>
          <AppText variant="label" color="textMuted">
            Access code
          </AppText>
          <AppText variant="title" selectable>
            {grant.data.token}
          </AppText>
          <AppText variant="caption" color="textMuted">
            Expires {formatDateTime(grant.data.expiresAt)} · {grant.data.scopes.join(', ')}
          </AppText>
        </AppCard>
      )}
      {USE_MOCKS && <DemoNotice message="DEMO — in MOCK mode the code is always DEMO-1234. Enter it in Doctor → QR Scanner." />}
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
