import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/design-system';
import { USE_MOCKS } from '@/config/config';
import { radius, spacing } from '@/design-system/theme';
import { DEMO_ACCESS_TOKEN } from '@/services/mock/mockPatient';
import { saveDoctorSession } from './doctorSession';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/**
 * QR Scanner — camera is a placeholder; the doctor types the access code.
 * TODO(mobile): use CameraView from expo-camera (works in Expo Go) with barcode scanning,
 * then call the same `redeem()` with the scanned qrPayload.
 */
export function QrScannerScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [token, setToken] = useState(USE_MOCKS ? DEMO_ACCESS_TOKEN : '');
  const redeem = useSubmit(api.redeemAccess);

  const submit = async () => {
    const session = await redeem.run({ token: token.trim() });
    if (session) {
      saveDoctorSession(session);
      router.replace({ pathname: '/doctor/patient/[id]', params: { id: session.patient.id } });
    }
  };

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={[styles.camera, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Ionicons name="scan-outline" size={96} color={colors.textSubtle} />
        <AppText variant="caption" color="textMuted">
          {t('doctor.cameraPlaceholder')}
        </AppText>
      </View>

      <AppInput
        label={t('doctor.accessCode')}
        icon="key-outline"
        placeholder={t('doctor.accessCodePlaceholder')}
        autoCapitalize="characters"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
        onClear={() => setToken('')}
      />
      <AppButton title={t('doctor.unlock')} icon="lock-open-outline" fullWidth disabled={!token.trim()} loading={redeem.isLoading} onPress={submit} />
      {redeem.error && <ErrorState title={t('doctor.accessDenied')} message={redeem.error} />}
      {USE_MOCKS && <DemoNotice message={t('doctor.demoCode', { code: DEMO_ACCESS_TOKEN })} />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { aspectRatio: 1, borderRadius: radius.xl, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
