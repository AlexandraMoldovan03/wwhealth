import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, DemoNotice, ErrorState, ScreenContainer } from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { radius, spacing } from '@/constants/theme';
import { DEMO_ACCESS_TOKEN } from '@/data/mockPatient';
import { saveDoctorSession } from '@/features/doctor/doctorSession';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';

/**
 * QR Scanner — camera is a placeholder; the doctor types the access code.
 * TODO(mobile): use CameraView from expo-camera (works in Expo Go) with barcode scanning,
 * then call the same `redeem()` with the scanned qrPayload.
 */
export function QrScannerScreen() {
  const { colors } = useTheme();
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
          Camera scanner placeholder
        </AppText>
      </View>

      <AppInput
        label="Access code"
        icon="key-outline"
        placeholder="e.g. DEMO-1234"
        autoCapitalize="characters"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
        onClear={() => setToken('')}
      />
      <AppButton title="Unlock patient record" icon="lock-open-outline" fullWidth disabled={!token.trim()} loading={redeem.isLoading} onPress={submit} />
      {redeem.error && <ErrorState title="Access denied" message={redeem.error} />}
      {USE_MOCKS && <DemoNotice message={`DEMO — use code ${DEMO_ACCESS_TOKEN} (or generate one in Patient → QR Passport).`} />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { aspectRatio: 1, borderRadius: radius.xl, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
