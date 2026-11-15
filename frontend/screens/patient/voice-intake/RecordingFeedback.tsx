import type { AudioRecorder } from 'expo-audio';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

const strands = Array.from({ length: 22 }, (_, strand) => (
  Array.from({ length: 65 }, (_, step) => {
    const x = step * 5;
    const t = step / 64;
    const envelope = Math.sin(t * Math.PI) ** .85;
    const phase = strand * .18;
    const y = 56 + envelope * (
      24 * Math.sin(t * Math.PI * 3.8 + phase) +
      13 * Math.sin(t * Math.PI * 7 - phase * .7)
    );
    return (step === 0 ? 'M' : 'L') + x + ' ' + y.toFixed(2);
  }).join(' ')
));

export function RecordingFeedback({ recorder, processing = false }: { recorder: Pick<AudioRecorder, 'getStatus'>; processing?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const motion = useSharedValue(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (processing) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    if (processing || reducedMotion) return;
    const timer = setInterval(() => {
      const { metering } = recorder.getStatus();
      const level = typeof metering === 'number' && Number.isFinite(metering)
        ? Math.max(0, Math.min(1, (metering + 55) / 37)) ** .8
        : 0;
      motion.set(withTiming(level, { duration: level > motion.get() ? 70 : 170, easing: Easing.out(Easing.quad) }));
    }, 70);
    return () => {
      clearInterval(timer);
      cancelAnimation(motion);
    };
  }, [motion, processing, recorder, reducedMotion]);

  const collapse = useSharedValue(1);
  useEffect(() => {
    collapse.set(withTiming(processing ? 0.025 : 1, { duration: reducedMotion ? 0 : 350 }));
  }, [collapse, processing, reducedMotion]);

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: collapse.value * (reducedMotion ? 1 : .18 + motion.value * 1.41) }],
  }));
  const elapsed = [Math.floor(seconds / 60), seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');

  return (
    <AppCard tone="flat" style={styles.panel}>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <AppText variant="subheading">{processing ? t('voiceRecording.processing') : t('voiceRecording.active')}</AppText>
      </View>
      <Animated.View accessible={false} style={[styles.wave, waveStyle]}>
        <Svg width="100%" height={100} viewBox="0 0 320 112">
          {strands.map((path, index) => (
            <Path key={path} d={path} fill="none" stroke={index < 11 ? colors.primary : colors.accent}
              strokeWidth={1.1} strokeOpacity={.29 + .28 * Math.sin(index / 21 * Math.PI)} />
          ))}
        </Svg>
      </Animated.View>
      <AppText variant="title" align="center" style={styles.timer}>{elapsed}</AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.xs },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  wave: { overflow: 'hidden' },
  timer: { fontVariant: ['tabular-nums'] },
});
