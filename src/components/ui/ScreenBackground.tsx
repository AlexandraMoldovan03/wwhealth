import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

const WAVE_LIGHT = require('../../../assets/images/wave-light.png');
const WAVE_DARK = require('../../../assets/images/wave-dark.png');
const LUNGS_LIGHT = require('../../../assets/images/lungs-light.png');
const LUNGS_DARK = require('../../../assets/images/lungs-dark.png');

interface Props {
  /** Lungs line-art in the top-right corner (Home screen look). Default: false. */
  showLungs?: boolean;
}

/**
 * Mint background + decorative wave (bottom) + optional lungs (top-right).
 * Render it as the FIRST child of ScreenContainer's outer View; it ignores touches.
 */
export function ScreenBackground({ showLungs = false }: Props) {
  const { colors, isDark } = useTheme();

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <Image source={isDark ? WAVE_DARK : WAVE_LIGHT} resizeMode="contain" style={styles.wave} />
      {showLungs && <Image source={isDark ? LUNGS_DARK : LUNGS_LIGHT} resizeMode="contain" style={styles.lungs} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wave: { position: 'absolute', right: -40, bottom: -20, width: '95%', height: '60%' },
  lungs: { position: 'absolute', top: 24, right: -24, width: 170, height: 170, opacity: 0.9 },
});
