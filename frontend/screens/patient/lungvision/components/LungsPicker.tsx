import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  Easing,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useEffect, useRef, useState } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';

const colors = ['#4D929E', '#64AEBC', '#75C8BA', '#A0E2CA', '#D3F8E7'];

// Each section gives the outer and inner distance from the chest center.
const sections = [
  [0, 33, 30], [.07, 54, 17], [.19, 77, 10], [.36, 96, 9],
  [.57, 107, 12], [.77, 112, 17], [.9, 114, 24], [.97, 102, 43], [1, 83, 83],
];

function dot(x: number, y: number, radius: number) {
  const r = radius.toFixed(2);
  const diameter = (radius * 2).toFixed(2);
  return `M${(x - radius).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${diameter} 0a${r} ${r} 0 1 0 -${diameter} 0Z`;
}

function makeLobe(side: -1 | 1) {
  let seed = side === -1 ? 391 : 701;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const paths = colors.map(() => Array<string>(6).fill(''));

  for (let index = 0; index < 2450; index++) {
    const height = random();
    const end = sections.findIndex(([position]) => position > height);
    const [startHeight, startOuter, startInner] = sections[end - 1];
    const [endHeight, endOuter, endInner] = sections[end];
    const fraction = (height - startHeight) / (endHeight - startHeight);
    const outer = startOuter + (endOuter - startOuter) * fraction;
    const cardiacNotch = side === 1 ? 17 * Math.exp(-((height - .64) ** 2) / .017) : 0;
    const inner = startInner + (endInner - startInner) * fraction + cardiacNotch;
    const width = outer - inner;
    if (random() > width / 104) continue;
    const distance = inner + random() * width + (random() - .5) * 5;
    const x = side === -1 ? 140 - distance : distance;
    const y = 32 + height * (side === -1 ? 148 : 141) - 10 * Math.sin(distance / 114 * Math.PI);
    const cluster = Math.sin(x * .17 + y * .12) * Math.cos(y * .23);
    if (random() > .78 + cluster * .2) continue;

    const radius = .3 + random() ** 2 * 1.08;
    const shade = Math.floor(random() ** 1.6 * colors.length);
    paths[shade][index % 6] += dot(x, y, radius);
  }
  return paths;
}

function makeAirway() {
  const branches = [
    [140, 11, 140, 66, 6],
    [140, 64, 104, 94, 5], [140, 64, 174, 91, 5],
    [104, 94, 76, 122, 3], [104, 94, 89, 76, 2],
    [174, 91, 204, 117, 3], [174, 91, 191, 72, 2],
  ];
  return branches.map(([x1, y1, x2, y2, spread], branch) => {
    const count = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    return Array.from({ length: count }, (_, index) => {
      const t = index / count;
      const x = x1 + (x2 - x1) * t + spread * Math.sin(index * 2.39 + branch);
      const y = y1 + (y2 - y1) * t + spread * .6 * Math.cos(index * 1.87);
      return dot(x, y, .42 + .49 * Math.sin(index * 2.1) ** 2);
    }).join('');
  }).join('');
}

const airway = makeAirway();

const left = makeLobe(-1);
const right = makeLobe(1);

export function LungsPicker({ onReveal }: { onReveal: () => void }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const started = useRef(false);
  const [isBursting, setIsBursting] = useState(false);

  useEffect(() => () => cancelAnimation(pulse), [pulse]);

  const airwayStyle = useAnimatedStyle(() => ({
    opacity: .86 * (1 - pulse.value),
    transform: [{ translateY: -14 * pulse.value }],
  }));

  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -5 * pulse.value }, { rotate: `${-3 * pulse.value}deg` },
      { scale: 1 + .09 * pulse.value }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 5 * pulse.value }, { rotate: `${3 * pulse.value}deg` },
      { scale: 1 + .09 * pulse.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('lung.animatePreview')}
      style={styles.scene}
      disabled={isBursting}
      onPress={() => {
        if (started.current) return;
        started.current = true;
        if (reducedMotion) {
          onReveal();
          return;
        }
        setIsBursting(true);
        pulse.set(withTiming(1, { duration: 570, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) scheduleOnRN(onReveal);
        }));
      }}
    >
      <Animated.View entering={FadeIn.duration(300)} pointerEvents="none" style={styles.pair}>
        <Animated.View style={[StyleSheet.absoluteFill, airwayStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 280 188">
            <Path d={airway} fill="#98DFD1" />
          </Svg>
        </Animated.View>
        {[{ paths: left, motion: leftStyle }, { paths: right, motion: rightStyle }].map(({ paths, motion }, index) => (
          <Animated.View key={index} style={[styles.lobe, motion]}>
            {directions.map(([dx, dy], layer) => (
              <ParticleLayer key={layer} paths={paths} layer={layer} dx={index === 0 ? -dx : dx} dy={dy} progress={pulse} />
            ))}
          </Animated.View>
        ))}
      </Animated.View>
    </Pressable>
  );
}

const directions = [[18, -65], [65, -32], [86, 3], [48, 57], [4, 67], [-32, 18]];

function ParticleLayer({ paths, layer, dx, dy, progress }: {
  paths: string[][];
  layer: number;
  dx: number;
  dy: number;
  progress: ReturnType<typeof useSharedValue<number>>;
}) {
  const motion = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) ** 1.65,
    transform: [
      { translateX: dx * progress.value },
      { translateY: dy * progress.value },
      { scale: 1 + .16 * progress.value },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, motion]}>
      <Svg width="100%" height="100%" viewBox="0 0 140 188">
        {paths.map((layers, shade) => <Path key={colors[shade]} d={layers[layer]} fill={colors[shade]} />)}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { alignSelf: 'center', width: '100%', maxWidth: 310 },
  pair: { flexDirection: 'row', height: 206 },
  lobe: { flex: 1 },
});
