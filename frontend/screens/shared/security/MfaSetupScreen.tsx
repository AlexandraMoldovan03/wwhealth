import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { cancelEnrollment, MfaError, startTotpEnrollment, verifyTotp, type TotpEnrollment } from '@/services/security/mfa';
import { formatSecret } from '@/services/security/mfaLogic';

/** Enrol an authenticator app: scan the QR (or type the key), then confirm with a 6-digit code. */
export function MfaSetupScreen() {
  const { t } = useTranslation();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    startTotpEnrollment()
      .then((e) => {
        pending.current = e.factorId;
        setEnrollment(e);
      })
      .catch((e) => setError(t(e instanceof MfaError ? e.key : 'security.mfa.errors.generic')));
    // Leaving before confirming removes the unverified factor (no half-enrolled state).
    return () => {
      if (pending.current) void cancelEnrollment(pending.current);
    };
  }, [t]);

  const verify = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(enrollment.factorId, code);
      pending.current = null;
      setDone(true);
    } catch (e) {
      setError(t(e instanceof MfaError ? e.key : 'security.mfa.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <ScreenContainer>
        <AppText variant="title">{t('security.mfa.enabledTitle')}</AppText>
        <AppText color="textMuted">{t('security.mfa.recovery')}</AppText>
        <AppButton title={t('common.done')} fullWidth onPress={() => router.back()} />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <AppText variant="title" accessibilityRole="header">
        {t('security.mfa.setupTitle')}
      </AppText>
      <AppText color="textMuted">{t('security.mfa.setupStep1')}</AppText>
      {error && <ErrorState compact title={t('security.errorTitle')} message={error} />}
      {!enrollment && !error && <LoadingState />}
      {enrollment && (
        <>
          <AppCard style={styles.qrCard}>
            <View style={styles.qr} accessible accessibilityLabel={t('security.mfa.qrLabel')}>
              <QRCode value={enrollment.uri} size={200} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <AppText variant="caption" color="textMuted" align="center">
              {t('security.mfa.manualKey')}
            </AppText>
            <AppText variant="subheading" align="center" selectable style={styles.secret}>
              {formatSecret(enrollment.secret)}
            </AppText>
          </AppCard>
          <AppText color="textMuted">{t('security.mfa.setupStep2')}</AppText>
          <AppInput
            label={t('security.mfa.code')}
            icon="keypad-outline"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void verify()}
          />
          <AppButton title={t('security.mfa.verify')} fullWidth loading={busy} disabled={code.replace(/\D/g, '').length !== 6} onPress={() => void verify()} />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  qrCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  qr: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: radius.lg },
  secret: { letterSpacing: 1 },
});
