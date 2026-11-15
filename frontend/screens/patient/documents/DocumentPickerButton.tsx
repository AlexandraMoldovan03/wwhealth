import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

const page = [[42, 22], [110, 22], [146, 58], [146, 149], [42, 149], [42, 22]];
const fold = [[110, 22], [110, 58], [146, 58]];
const back = [[53, 12], [116, 12], [158, 54], [158, 142]];
const ink = [
  [[60, 74], [96, 74]],
  [[60, 89], [128, 89]],
  [[60, 104], [120, 104]],
  [[60, 119], [104, 119]],
];

function makeParticles() {
  let seed = 1427;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const paths = ['', '', ''];
  const add = (x: number, y: number, radius: number, tone: number) => {
    const r = radius.toFixed(2);
    const diameter = (radius * 2).toFixed(2);
    paths[tone] += 'M' + (x - radius).toFixed(2) + ' ' + y.toFixed(2)
      + 'a' + r + ' ' + r + ' 0 1 0 ' + diameter + ' 0a' + r + ' ' + r + ' 0 1 0 -' + diameter + ' 0Z';
  };

  function trace(points: number[][], tone: number, spread: number) {
    for (let index = 1; index < points.length; index++) {
      const [x, y] = points[index - 1];
      const [endX, endY] = points[index];
      const count = Math.ceil(Math.hypot(endX - x, endY - y) * 1.35);
      for (let dot = 0; dot < count; dot++) {
        const t = random();
        add(x + (endX - x) * t + (random() - .5) * spread,
          y + (endY - y) * t + (random() - .5) * spread,
          .35 + random() * .85, tone);
      }
    }
  }

  trace(back, 2, 7);
  trace(page, 0, 6);
  trace(fold, 1, 5);
  ink.forEach((line) => trace(line, 1, 5));
  for (let index = 0; index < 180; index++) {
    const x = 30 + random() * 137;
    const y = 9 + random() * 150;
    if (x + 22 - y > 110) continue;
    add(x, y, .25 + random() * .55, 2);
  }
  return paths;
}

const particles = makeParticles();

export function DocumentPickerButton({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const artStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * .18,
    transform: [{ scale: 1 - pressed.value * .07 }, { rotate: String(pressed.value * -4) + 'deg' }],
  }));
  const tones = [colors.primary, colors.accent, colors.primary];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      onPressIn={() => { if (!reducedMotion) pressed.set(withTiming(1, { duration: 120 })); }}
      onPressOut={() => pressed.set(withTiming(0, { duration: reducedMotion ? 0 : 220 }))}
      style={styles.button}
    >
      <Animated.View pointerEvents="none" style={artStyle}>
        <Svg width={188} height={158} viewBox="0 0 188 160" aria-hidden>
          {particles.map((path, index) => (
            <Path key={index} d={path} fill={tones[index]} opacity={[.95, .85, .32][index]} />
          ))}
        </Svg>
      </Animated.View>
      <AppText variant="subheading" align="center">{title}</AppText>
      <AppText variant="caption" color="textMuted" align="center">{hint}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
  },
});
