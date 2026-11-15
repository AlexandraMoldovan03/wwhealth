import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  ErrorState,
  InfoRow,
  LoadingState,
  ScreenContainer,
  SectionHeader,
  tapFeedback,
} from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { EmergencyDataView } from '@/screens/doctor/emergency-scan/components/EmergencyDataView';
import { EmergencyQrCard, useCountdown } from '@/screens/patient/emergency-passport';
import { api } from '@/services/backend';
import type { EmergencyTokenResponse } from '@/types';
import { getErrorMessage } from '@/utils/errors';

/**
 * Emergency passport of someone who made me their emergency contact (link accepted by me).
 * ONLY emergency data; every opening is logged for the patient. I can also show their 5-minute QR to a doctor.
 */
export function GuardianPassportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const load = useCallback(() => api.getGuardianEmergencyView(String(patientId ?? '')), [patientId]);
  const view = useAsync(load);
  const [code, setCode] = useState<EmergencyTokenResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(code?.expiresAt ?? null);
  const active = !!code && secondsLeft > 0;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    act(async () => {
      setCode(await api.createGuardianEmergencyToken(String(patientId ?? '')));
      tapFeedback('success');
    });

  const stepDown = (linkId: string) =>
    act(async () => {
      await api.respondEmergencyGuardian(linkId, false);
      router.back();
    });

  if (view.isLoading && !view.data) {
    return (
      <ScreenContainer>
        <LoadingState count={3} />
      </ScreenContainer>
    );
  }
  if (view.error || !view.data) {
    const gone = !view.error || /not available/i.test(view.error);
    return (
      <ScreenContainer>
        {gone ? (
          <EmptyState icon="lock-closed-outline" title={t('guardians.title')} message={t('guardians.notAvailable')} />
        ) : (
          <ErrorState message={view.error ?? ''} onRetry={view.reload} />
        )}
      </ScreenContainer>
    );
  }

  const data = view.data;
  const name = data.patientName || t('guardians.unnamed');

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.heading}>
        <AppText variant="title" accessibilityRole="header">{name}</AppText>
        <AppText color="textMuted">{t('guardians.passportIntro', { name })}</AppText>
      </View>

      <EmergencyDataView data={data} />

      {data.emergencyContact && (
        <View style={styles.section}>
          <SectionHeader title={t('guardians.contactTitle')} />
          <AppCard>
            <InfoRow
              first
              label={data.emergencyContact.relation || t('guardians.contactTitle')}
              value={`${data.emergencyContact.name} · ${data.emergencyContact.phone}`}
            />
          </AppCard>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader title={t('guardians.qrTitle')} />
        {active ? (
          <EmergencyQrCard code={code} secondsLeft={secondsLeft}>
            <AppButton
              title={t('guardians.hideQr')}
              icon="eye-off-outline"
              variant="outline"
              fullWidth
              onPress={() => setCode(null)}
            />
          </EmergencyQrCard>
        ) : (
          <>
            <AppText color="textMuted">{t('guardians.qrIntro')}</AppText>
            <AppButton
              title={t('guardians.generateQr')}
              icon="qr-code-outline"
              variant="danger"
              size="lg"
              fullWidth
              loading={busy}
              onPress={() => void generate()}
            />
          </>
        )}
        {error && <ErrorState message={error} />}
      </View>

      <StepDown patientId={String(patientId ?? '')} busy={busy} onStepDown={stepDown} />
    </ScreenContainer>
  );
}

/** Lets the guardian end the link (looked up from the overview, so the route only needs the patient id). */
function StepDown({ patientId, busy, onStepDown }: { patientId: string; busy: boolean; onStepDown: (linkId: string) => void }) {
  const { t } = useTranslation();
  const overview = useAsync(api.getEmergencyGuardians);
  const link = overview.data?.protecting.find((p) => p.patientId === patientId);
  if (!link) return null;
  return (
    <AppButton
      title={t('guardians.stepDown')}
      variant="ghost"
      fullWidth
      disabled={busy}
      onPress={() => onStepDown(link.id)}
    />
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  section: { gap: spacing.sm },
});
