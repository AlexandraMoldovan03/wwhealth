import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/design-system/useTheme';

/** Decorative lungs and waves, with separate assets for each theme. */
const LAYERS = {
  light: {
    lungs: require('../../../assets/images/background/lungs-light.png'),
    waves: require('../../../assets/images/background/waves-light.png'),
  },
  dark: {
    lungs: require('../../../assets/images/background/lungs-dark.png'),
    waves: require('../../../assets/images/background/waves-dark.png'),
  },
} as const;
const LUNGS_RATIO = 355 / 380;
const WAVES_RATIO = 923 / 830;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function AppBackground({ showLungs = true }: { showLungs?: boolean }) {
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const layers = LAYERS[isDark ? 'dark' : 'light'];

  const lungsW = clamp(width * 0.36, 110, 230);
  // Waves span the full width; on wide or short windows only their lower part shows (max ~40% of the height).
  const wavesH = width / WAVES_RATIO;
  const wavesBox = Math.min(wavesH, height * 0.4);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.waves, { height: wavesBox }]}>
        <Image source={layers.waves} style={{ width, height: wavesH }} resizeMode="stretch" />
        {/* Soft top edge, so the cut line of the waves never shows. */}
        <LinearGradient colors={[colors.background, `${colors.background}00`]} style={[styles.fade, { height: wavesBox * 0.35 }]} />
      </View>
      {/* Under a navigation header the lungs sit among the first rows of content, so they stay faint there. */}
      {showLungs && <Image
        source={layers.lungs}
        style={[styles.lungs, { width: lungsW, height: lungsW / LUNGS_RATIO, opacity: 0.35 }]}
        resizeMode="contain"
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  waves: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', justifyContent: 'flex-end' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  lungs: { position: 'absolute', top: 0, right: 0 },
});
