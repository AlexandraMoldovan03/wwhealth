import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

export type Prediction = { label: string; probability: number }; // 0..1
type Props = { predictions: Prediction[] };

type Theme = { a: string; b: string; glow: string; icon: keyof typeof Ionicons.glyphMap };
const THEMES: Record<string, Theme> = {
  normal: { a: '#0e5f58', b: '#041f1d', glow: '#2dd4bf', icon: 'checkmark-circle-outline' },
  pneumonia: { a: '#7a1d22', b: '#2b070b', glow: '#f0524f', icon: 'thermometer-outline' },
  effusion: { a: '#473bb0', b: '#161344', glow: '#8b7bff', icon: 'water-outline' },
  cardiomegaly: { a: '#7a4712', b: '#2a1707', glow: '#f2a33a', icon: 'heart-outline' },
};
const FALLBACK: Theme = { a: '#1f4f86', b: '#0a1b33', glow: '#4aa3e0', icon: 'analytics-outline' };
const ORBS = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 0.61803) % 1,
  y: (i * 0.38197 + 0.13) % 1,
  s: 7 + ((i * 5) % 4) * 4,
  d: 2200 + ((i * 377) % 2400),
}));

/** Soft radial glow faked with stacked translucent circles (no blur library needed). */
function Glow({ color, size, pos, opacity = 1, delay = 0 }: { color: string; size: number; pos: object; opacity?: number; delay?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 7000, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(v, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity },
        pos,
        { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, -10] }) }] },
      ]}
    >
      {[1, 0.74, 0.5, 0.3].map((k) => (
        <View key={k} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: (size * k) / 2, backgroundColor: color, opacity: 0.085 }} />
      ))}
    </Animated.View>
  );
}

/** Glowing bubble: bright core + coloured halos, drifting and pulsing. */
function Orb({ left, top, s, d, color }: { left: number; top: number; s: number; d: number; color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(v, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, d]);
  const box = s * 3.4;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: left - (box - s) / 2, top: top - (box - s) / 2, width: box, height: box, alignItems: 'center', justifyContent: 'center',
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-4, 5] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [3, -4] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.14] }) }],
      }}
    >
      {[[1, 0.07], [0.72, 0.13], [0.5, 0.24]].map(([k, o]) => (
        <View key={k} style={{ position: 'absolute', width: box * k, height: box * k, borderRadius: (box * k) / 2, backgroundColor: color, opacity: o }} />
      ))}
      <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: '#fff', opacity: 0.95 }} />
      <View style={{ position: 'absolute', width: s * 1.5, height: s * 1.5, borderRadius: s * 0.75, backgroundColor: '#fff', opacity: 0.22 }} />
    </Animated.View>
  );
}

function Card({ item, rank }: { item: Prediction; rank: number }) {
  const th = THEMES[item.label.toLowerCase()] ?? FALLBACK;
  const p = Number.isFinite(item.probability) ? Math.max(0, Math.min(1, item.probability)) : 0;
  const [prog] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(1));
  const [shown, setShown] = useState(0);
  const [w, setW] = useState(0);
  const nOrbs = p > 0 ? Math.max(2, Math.round(16 * Math.sqrt(p))) : 0;

  const play = useCallback(() => {
    prog.setValue(0);
    Animated.timing(prog, { toValue: p * 100, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [prog, p]);

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 500, delay: rank * 130, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false }).start();
    const t = setTimeout(play, rank * 130 + 280);
    return () => clearTimeout(t);
  }, [enter, play, rank]);

  useEffect(() => {
    const id = prog.addListener(({ value }) => setShown(value));
    return () => prog.removeListener(id);
  }, [prog]);

  const num = shown > 0 && shown < 1 ? '<1' : String(Math.round(shown));
  const top = rank === 0;

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: press }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.label} ${Math.round(p * 100)} percent`}
        onPress={play}
        onPressIn={() => Animated.spring(press, { toValue: 0.985, useNativeDriver: true, isInteraction: false }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, isInteraction: false }).start()}
      >
        <View style={[styles.card, { borderColor: top ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.10)' }]}>
          <LinearGradient colors={[th.a, th.b]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          <Glow color={th.glow} size={250} pos={{ right: -80, top: -110 }} opacity={top ? 1 : 0.75} />
          <Glow color={th.glow} size={190} pos={{ left: -70, bottom: -100 }} opacity={top ? 0.6 : 0.4} delay={2500} />
          <View style={styles.hl} />
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>{item.label}</Text>
            </View>
          </View>
          <View style={styles.pill}>
            <View style={styles.numRow}>
              <Text style={styles.num}>{num}</Text>
              <Text style={styles.unit}>%</Text>
            </View>
            <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.fill, { width: prog.interpolate({ inputRange: [0, 100], outputRange: [0, Math.max(0, w - 8)] }) }]}>
                <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.30)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                {w > 0 && ORBS.slice(0, nOrbs).map((o, i) => <Orb key={i} s={o.s} d={o.d} color={th.glow} left={2 + o.x * Math.max(0, p * (w - 8) - o.s - 8)} top={o.y * (40 - o.s)} />)}
              </Animated.View>
            </View>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: th.a }]}>
          <Ionicons name={th.icon} size={15} color="rgba(255,255,255,0.92)" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function PredictionCards({ predictions }: Props) {
  const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
  return (
    <View style={styles.wrap}>
      {sorted.map((p, i) => (
        <Card key={p.label} item={p} rank={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingTop: 10, paddingLeft: 8 },
  flex: { flex: 1 },
  card: { borderRadius: 22, padding: 18, gap: 18, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  hl: { position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  badge: { position: 'absolute', left: -8, top: -8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  head: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  title: { color: '#fff', fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  pill: { height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 18, minWidth: 92 },
  track: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  fill: { position: 'absolute', left: 4, top: 4, bottom: 4, overflow: 'hidden', borderRadius: 20 },
  num: { color: '#fff', fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6 },
  unit: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500', marginBottom: 5, marginLeft: 2 },
});
