import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useId, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppButton, AppText, GradientCard } from '@/design-system';
import { gradients, spacing } from '@/design-system/theme';
import { tapFeedback } from '@/design-system/motion';
import { api } from '@/services/backend';
import { useEmergencyToken } from '@/services/EmergencyTokenProvider';
import { formatCountdown, useCountdown } from '@/screens/patient/emergency-passport/useCountdown';
import { useTranslation } from 'react-i18next';

/** Home shortcut; an active emergency QR replaces the normal passport card. */
export function EmergencyCard({ enterIndex }: { enterIndex?: number }) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const { token, clearToken } = useEmergencyToken();
  const tileId = useId();
  const [closing, setClosing] = useState(false);
  const secondsLeft = useCountdown(token?.expiresAt ?? null);
  const activeToken = !!token && secondsLeft > 0;

  useEffect(() => {
    if (!focused || !activeToken || !token) return;
    let mounted = true;
    let checking = false;
    const checkStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await api.getEmergencyTokenStatus(token.tokenId);
        if (mounted && result.status !== 'active') await clearToken();
      } catch {
        // Keep the saved QR visible offline and retry while Home is focused.
      } finally {
        checking = false;
      }
    };
    void checkStatus();
    const interval = setInterval(() => { void checkStatus(); }, 2_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkStatus();
    });
    return () => { mounted = false; clearInterval(interval); appState.remove(); };
  }, [activeToken, clearToken, focused, token]);

  const closeQr = async () => {
    if (!token) return;
    setClosing(true);
    try {
      await api.revokeEmergencyToken(token.tokenId);
    } catch {
      // The token may already have been scanned or expired; hide it locally either way.
    } finally {
      await clearToken();
      setClosing(false);
    }
  };

  if (activeToken && token) {
    return (
      <GradientCard colors={gradients.emergency} enterIndex={enterIndex}>
        <View style={styles.activeToken}>
          <View style={styles.qrBox}>
            <QRCode value={token.qrPayload} size={220} ecl="M" />
          </View>
          <AppText variant="heading" style={styles.ink} align="center">
            {t('emergency.timeLeft', { time: formatCountdown(secondsLeft) })}
          </AppText>
          <AppButton title={t('emergency.revoke')} icon="close-circle-outline" variant="outline" contentColor="#000000" fullWidth loading={closing} onPress={closeQr} />
        </View>
      </GradientCard>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.emergencyQr')}
      onPress={() => { tapFeedback(); router.push('/patient/emergency'); }}
      style={({ pressed }) => [styles.generateButton, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={styles.qrTile}>
        <Svg accessible={false} width="100%" height="100%" viewBox="0 0 108 108" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={tileId} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#FFD8DC" />
              <Stop offset="52%" stopColor="#F47D8E" stopOpacity={.94} />
              <Stop offset="100%" stopColor="#E75C73" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={108} height={108} fill={'url(#' + tileId + ')'} />
          {edgeDots.map(({ x, y, size, opacity }, index) => (
            <Circle key={index} cx={x} cy={y} r={size} fill="#EF7185" opacity={opacity} />
          ))}
        </Svg>
        <Ionicons name="qr-code-outline" size={41} color="#781F32" />
      </View>
      <AppText variant="subheading" align="center">{t('home.emergencyQr')}</AppText>
    </Pressable>
  );
}

const edgeDots = Array.from({ length: 18 * 18 }, (_, index) => {
  const x = 4 + (index % 18) * 5.9 + Math.sin(index * 2.4) * 1.8;
  const y = 4 + Math.floor(index / 18) * 5.9 + Math.cos(index * 1.7) * 1.8;
  const distance = Math.max(Math.abs(x - 54), Math.abs(y - 54));
  const fade = Math.max(0, 1 - distance / 55);
  return { x, y, size: .55 + fade * 1.7, opacity: distance > 27 ? fade * 1.35 : 0 };
}).filter(({ opacity }) => opacity > 0.04);

const styles = StyleSheet.create({
  generateButton: { alignSelf: 'center', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.sm },
  pressed: { opacity: .82, transform: [{ scale: .96 }] },
  qrTile: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' },
  activeToken: { alignItems: 'center', gap: spacing.sm },
  qrBox: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 16 },
  ink: { color: '#1C2E34' },
});
