import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

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
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  const secondsLeft = useCountdown(token?.expiresAt ?? null);
  const activeToken = !!token && secondsLeft > 0;

  useEffect(() => {
    cancelAnimation(glow);
    if (!focused || activeToken || reduceMotion) {
      glow.set(0);
      return;
    }
    glow.set(withRepeat(withTiming(1, { duration: 1_100, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(glow);
  }, [activeToken, focused, glow, reduceMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: '#B9505F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: interpolate(glow.value, [0, 1], [0.28, 0.68]),
    shadowRadius: interpolate(glow.value, [0, 1], [8, 18]),
    elevation: interpolate(glow.value, [0, 1], [5, 12]),
  }));

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
    <Animated.View style={[styles.generateGlow, glowStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.emergencyQr')}
        onPress={() => { tapFeedback(); router.push('/patient/emergency'); }}
        style={styles.generateButton}
      >
        <Ionicons name="qr-code-outline" size={34} color="#B9505F" />
        <AppText variant="subheading" align="center" style={styles.generateLabel}>
          {t('home.emergencyQr')}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  generateGlow: { borderRadius: 22, shadowColor: '#B9505F' },
  generateButton: {
    minHeight: 112,
    borderRadius: 22,
    backgroundColor: '#F2C6CD',
    borderColor: '#E8AEB7',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  generateLabel: { color: '#B9505F' },
  activeToken: { alignItems: 'center', gap: spacing.sm },
  qrBox: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 16 },
  ink: { color: '#1C2E34' },
});
