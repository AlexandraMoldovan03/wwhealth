import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/design-system/useTheme';
import { AppText } from './AppText';

export function BrandLogo() {
  const { colors, isDark, isDoctorTheme } = useTheme();
  const face = isDoctorTheme ? colors.primary : isDark ? '#9CE3CA' : '#297E6A';
  const fold = isDoctorTheme ? (isDark ? colors.info : colors.ink) : isDark ? '#51A991' : '#185948';

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="WWHealth" style={styles.logo}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.art}>
        <Svg width={90} height={39} viewBox="0 0 286 124">
          <Path fill={face} d="M7 28 31 8 56 69 69 13 96 6 118 71 154 8 179 7 116 113 91 116 77 56 63 112 39 116Z" />
          <Path fill={fold} d="M39 116 69 13 77 56 63 112ZM91 116 154 8 179 7 116 113Z" />
          <Path fill={face} d="m120 28 24-20 24 61 14-56 27-7 22 65 36-63 17-1-59 106-22 3-14-60-14 56-24 4z" />
          <Path fill={fold} d="m151 116 31-103 7 43-14 56zm52 0L267 8l17-1-59 106z" />
        </Svg>
        <AppText allowFontScaling={false} style={[styles.word, { color: face }]}>Health</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 166, height: 44, justifyContent: 'center' },
  art: { flexDirection: 'row', alignItems: 'flex-end' },
  word: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }), fontSize: 26, lineHeight: 31, letterSpacing: -1.2, marginLeft: -10, marginBottom: 1 },
});
