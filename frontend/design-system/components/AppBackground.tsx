import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

/**
 * Brand background (logo, lungs, waves), one set per theme. The layers are separate transparent images
 * placed by rule instead of one stretched picture, so nothing is cropped or distorted on any screen size:
 * logo top-left aligned with the content column, lungs top-right, waves along the bottom.
 */
const LAYERS = {
  light: {
    logo: require('../../../assets/images/background/logo-light.png'),
    lungs: require('../../../assets/images/background/lungs-light.png'),
    waves: require('../../../assets/images/background/waves-light.png'),
    logoRatio: 522 / 136,
  },
  dark: {
    logo: require('../../../assets/images/background/logo-dark.png'),
    lungs: require('../../../assets/images/background/lungs-dark.png'),
    waves: require('../../../assets/images/background/waves-dark.png'),
    logoRatio: 528 / 124,
  },
} as const;
const LUNGS_RATIO = 355 / 380;
const WAVES_RATIO = 923 / 830;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Logo size for a window width — ScreenContainer uses it to keep the content clear of the logo. */
export function useBrandLogoSize() {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const w = clamp(width * 0.5, 150, 230);
  return { width: w, height: w / LAYERS[isDark ? 'dark' : 'light'].logoRatio };
}

export function BrandWordmark() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const logo = useBrandLogoSize();
  const layers = LAYERS[isDark ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const contentLeft = Math.max(0, (width - sizes.maxContentWidth) / 2) + spacing.lg - 4;

  return (
    <View
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel="WWHealth"
      style={[
        styles.wordmark,
        {
          top: insets.top + spacing.sm,
          left: contentLeft,
          width: logo.width,
          height: logo.height,
        },
      ]}
    >
      <Image source={layers.logo} style={styles.logoImage} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

export function AppBackground() {
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
      <Image
        source={layers.lungs}
        style={[styles.lungs, { width: lungsW, height: lungsW / LUNGS_RATIO, opacity: 0.35 }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  waves: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', justifyContent: 'flex-end' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  lungs: { position: 'absolute', top: 0, right: 0 },
  wordmark: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
  },
  logoImage: { width: '100%', height: '100%' },
});
