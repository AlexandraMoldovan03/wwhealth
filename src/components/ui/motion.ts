/**
 * Shared motion presets (react-native-reanimated). Every preset follows the system
 * "Reduce Motion" setting: with it on, items simply appear.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { motion } from '@/constants/theme';

/** Card / list item entrance; `index` staggers siblings (capped so long lists don't lag). */
export const enterUp = (index = 0) =>
  FadeInDown.duration(motion.slow)
    .delay(Math.min(index, 8) * motion.stagger)
    .reduceMotion(ReduceMotion.System);

export const fadeIn = (index = 0) =>
  FadeIn.duration(motion.normal)
    .delay(Math.min(index, 8) * motion.stagger)
    .reduceMotion(ReduceMotion.System);

export const fadeOut = FadeOut.duration(motion.fast).reduceMotion(ReduceMotion.System);

/** QR / result reveal. */
export const popIn = ZoomIn.springify().damping(16).reduceMotion(ReduceMotion.System);

export const pressSpring = { damping: 18, stiffness: 320, mass: 0.6 } as const;

/** Light tap feedback on iOS/Android (no-op on web). */
export function tapFeedback(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'success' || kind === 'warning'
      ? Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning)
      : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => undefined);
}
