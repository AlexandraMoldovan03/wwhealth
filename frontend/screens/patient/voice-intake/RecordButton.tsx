import { Platform, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/design-system';
import { useTheme } from '@/design-system/useTheme';
import { spacing } from '@/design-system/theme';

function makeMicrophoneDots() {
  const dots: { x: number; y: number; radius: number; accent: boolean }[] = [];
  for (let row = 0; row < 16; row++) {
    for (let column = 0; column < 13; column++) {
      const x = 8 + column * 4 + .65 * Math.sin(row * 3 + column);
      const y = 8 + row * 4 + .65 * Math.cos(column * 3 + row);
      const capsuleY = Math.max(18, Math.min(39, y));
      const capsule = Math.hypot(x - 32, y - capsuleY) < 12;
      const cradle = y >= 35 && Math.abs(Math.hypot(x - 32, Math.max(0, y - 40)) - 20) < 2.8;
      const stand = (Math.abs(x - 32) < 2.5 && y >= 60) || (y >= 67 && Math.abs(x - 32) < 13);
      if (capsule || cradle || stand) {
        dots.push({ x, y, radius: 1 + .65 * Math.sin(row + column * 2) ** 2, accent: (row + column) % 4 === 0 });
      }
    }
  }
  return dots;
}

const microphoneDots = makeMicrophoneDots();

interface RecordButtonProps {
  title: string;
  loading?: boolean;
  disabled?: boolean;
  stopping?: boolean;
  onPress: () => void;
}

export function RecordButton({ title, loading = false, disabled = false, stopping = false, onPress }: RecordButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.medallion, { backgroundColor: colors.primaryMuted, borderColor: colors.border }, stopping && styles.stopMedallion]}>
        {stopping ? <View style={styles.stopGlyph} /> : loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Svg {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })} width={70} height={83} viewBox="0 0 64 76">
            {microphoneDots.map(({ x, y, radius, accent }, index) => (
              <Circle key={index} cx={x} cy={y} r={radius} fill={accent ? colors.accent : colors.primary} />
            ))}
          </Svg>
        )}
      </View>
      <AppText variant="subheading" align="center">{title}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'center', alignItems: 'center', padding: spacing.xs, gap: spacing.sm },
  medallion: { width: 110, height: 110, borderRadius: 55, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stopMedallion: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FBEAE6', borderColor: '#E29BA7' },
  stopGlyph: { width: 19, height: 19, borderRadius: 6, backgroundColor: '#9D344A' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
