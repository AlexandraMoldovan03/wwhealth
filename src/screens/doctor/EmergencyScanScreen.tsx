import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, popIn, tapFeedback } from '@/components/ui';
import Animated from 'react-native-reanimated';
import { radius, spacing } from '@/constants/theme';
import { EmergencyDataView } from '@/features/emergency/components/EmergencyDataView';
import { emergencyRedeemError } from '@/features/emergency/emergencyErrors';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import type { EmergencyData } from '@/types';
import { useTranslation } from 'react-i18next';

const QR_PREFIX = 'wwhealth://emergency/';

/**
 * Emergency scan (doctor). The scanned code is sent unchanged to FastAPI, which checks the DOCTOR role,
 * validity (5 min), single use and revocation, logs the access and returns only the 4 emergency fields.
 * The result lives only in this screen's state (not saved on the device).
 */
export function EmergencyScanScreen({ inTab = false }: { inTab?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [data, setData] = useState<EmergencyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false); // the camera fires many events per QR
  const lastScan = useRef<{ value: string; at: number } | null>(null);

  const redeem = async (raw: string) => {
    if (busy.current || !raw.trim()) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      setData(await api.redeemEmergencyToken({ token: raw.trim() }));
      tapFeedback('success');
      setManual('');
    } catch (err) {
      setError(emergencyRedeemError(err));
      tapFeedback('warning');
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  if (data) {
    return (
      <ScreenContainer edges={inTab ? ['top'] : ['bottom']}>
        <Animated.View entering={popIn}>
          <EmergencyDataView data={data} />
        </Animated.View>
        <AppButton title={t('emergency.scanAnother')} icon="scan-outline" variant="outline" fullWidth onPress={() => setData(null)} />
      </ScreenContainer>
    );
  }

  const cameraReady = Platform.OS !== 'web' && permission?.granted;
  return (
    <ScreenContainer edges={inTab ? ['top'] : ['bottom']}>
      {inTab && (
        <AppText variant="title" accessibilityRole="header">
          {t('doctor.scanPatientQr')}
        </AppText>
      )}
      <AppText color="textMuted">{t('emergency.scanIntro')}</AppText>

      <View style={[styles.camera, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        {cameraReady ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={loading || error ? undefined : ({ data: scanned }) => {
              if (!scanned.toLowerCase().startsWith(QR_PREFIX)) return;
              // The same QR stays in frame for seconds: send it once (a token is single-use anyway).
              const now = Date.now();
              if (lastScan.current?.value === scanned && now - lastScan.current.at < 5_000) return;
              lastScan.current = { value: scanned, at: now };
              void redeem(scanned);
            }}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <AppText color="textMuted" align="center">
              {Platform.OS === 'web' ? t('emergency.cameraWeb') : t('emergency.cameraPermission')}
            </AppText>
            {Platform.OS !== 'web' && permission?.canAskAgain !== false && (
              <AppButton title={t('emergency.allowCamera')} icon="camera-outline" size="sm" onPress={() => void requestPermission()} />
            )}
          </View>
        )}
        {cameraReady && (
          <View pointerEvents="none" style={styles.frame}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <View key={c} style={[styles.corner, styles[c], { borderColor: '#FFFFFF' }]} />
            ))}
          </View>
        )}
        {loading && (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]}>
            <LoadingState message={t('common.loading')} />
          </View>
        )}
      </View>

      {error && (
        <View style={styles.gap}>
          <ErrorState compact title={t('emergency.denied')} message={error} />
          <AppButton title={t('emergency.tryAgain')} variant="outline" fullWidth onPress={() => setError(null)} />
        </View>
      )}

      <AppInput
        label={t('emergency.manualLabel')}
        icon="key-outline"
        placeholder={t('emergency.manualPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        value={manual}
        onChangeText={setManual}
        onClear={() => setManual('')}
      />
      <AppButton title={t('emergency.open')} icon="lock-open-outline" fullWidth disabled={!manual.trim()} loading={loading} onPress={() => void redeem(manual)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { aspectRatio: 1, borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: '14%' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#FFFFFF' },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  overlay: { alignItems: 'center', justifyContent: 'center' },
  gap: { gap: spacing.sm },
});
