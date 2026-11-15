import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tapFeedback } from './motion';
import { TABS, type TabConfig } from '@/config/navigation';
import { fonts, radius, spacing } from './theme';
import { useRole } from '@/services/auth/useCurrentUser';
import { useTheme } from './useTheme';

export function AppTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const role = useRole();

  const items = state.routes
    .map((route, index) => ({ route, index, tab: TABS.find((t) => t.name === route.name) }))
    .filter((it): it is typeof it & { tab: TabConfig } => !!it.tab && !it.tab.parent && it.tab.roles.includes(role));

  const current = TABS.find((tab) => tab.name === state.routes[state.index]?.name);
  const activeIndex = items.findIndex(({ index, tab }) => state.index === index || current?.parent === tab.name);
  const [rowWidth, setRowWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  const position = useSharedValue(Math.max(0, activeIndex));
  const halo = useSharedValue(0);
  const gradientId = useId();
  const itemWidth = rowWidth / Math.max(1, items.length);
  const activeColor = role === 'doctor' ? colors.accent : colors.primary;

  useEffect(() => {
    if (activeIndex < 0) return;
    position.set(reduceMotion ? activeIndex : withSpring(activeIndex, { damping: 21, stiffness: 225 }));
    halo.set(reduceMotion ? 0 : withSequence(
      withTiming(1, { duration: 140 }),
      withTiming(0, { duration: 430 }),
    ));
  }, [activeIndex, halo, position, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: .68 + halo.value * .32,
    transform: [{ scale: 1 + halo.value * .16 }],
  }));

  const capsuleMotion = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * itemWidth }],
  }));

  return (
    <View style={[styles.dock, { marginBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <LinearGradient
        colors={isDark ? ['#354D57E8', '#192B36F5'] : ['#FFFFFFF5', '#DDEFE9E8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.glass, { borderColor: isDark ? '#B7E8DA40' : '#FFFFFF' }]}
      >
        <View
          accessibilityRole="tablist"
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
          style={styles.row}
        >
          {activeIndex >= 0 && itemWidth > 6 && (
            <Animated.View pointerEvents="none" style={[
              styles.capsule, capsuleMotion,
              { width: itemWidth - 6 },
            ]}>
              <Animated.View style={[styles.halo, haloStyle]}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
                      <Stop offset="0" stopColor={activeColor} stopOpacity={isDark ? .94 : .82} />
                      <Stop offset={0.48} stopColor={activeColor} stopOpacity={isDark ? .48 : .46} />
                      <Stop offset="1" stopColor={activeColor} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={'url(#' + gradientId + ')'} />
                </Svg>
              </Animated.View>
              <LinearGradient
                colors={isDark ? ['#ECFFF22D', '#D4F8EB0A'] : ['#B8D0C6', '#D2E0D9']}
                style={[styles.selection, { borderColor: isDark ? '#B7E8DA66' : '#91B0A3' }]}
              />
            </Animated.View>
          )}
          {items.map(({ route, index, tab }, visibleIndex) => {
            const focused = visibleIndex === activeIndex;
            const options = descriptors[route.key]?.options;
            const label = typeof options?.title === 'string' ? options.title : tab.title;
            return (
              <TabItem
                key={route.key}
                label={label}
                icon={focused ? tab.iconFocused : tab.icon}
                focused={focused}
                activeColor={activeColor}
                onPress={() => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (state.index !== index && !event.defaultPrevented) {
                    tapFeedback();
                    navigateToTab(route.key);
                  }
                }}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              />
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}

interface TabItemProps {
  label: string;
  icon: TabConfig['icon'];
  focused: boolean;
  activeColor: string;
  onPress: () => void;
  onLongPress: () => void;
}

function TabItem({ label, icon, focused, activeColor, onPress, onLongPress }: TabItemProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.set(focused && !reduceMotion ? withSequence(
      withTiming(-4, { duration: 145 }),
      withSpring(0, { damping: 18, stiffness: 320, mass: 0.6 }),
    ) : 0);
  }, [focused, lift, reduceMotion]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: press.value }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        if (!reduceMotion) press.set(withTiming(0.9, { duration: 90 }));
      }}
      onPressOut={() => {
        if (!reduceMotion) press.set(withTiming(1, { duration: 110 }));
      }}
      style={styles.item}
      hitSlop={4}
    >
      <Animated.View style={[styles.content, contentStyle]}>
        <Ionicons name={icon} size={21} color={focused ? activeColor : colors.textMuted} />
        {focused && (
          <Animated.Text
            numberOfLines={1}
            style={[styles.label, { color: colors.text, fontFamily: fonts.bodyBold }]}
          >
            {label}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    width: '94%',
    maxWidth: 510,
    alignSelf: 'center',
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    boxShadow: '0 6px 22px rgba(8, 26, 34, 0.22)',
  },
  glass: { borderRadius: radius.pill, padding: 5, borderWidth: 1 },
  row: { flexDirection: 'row' },
  capsule: {
    position: 'absolute',
    left: 3,
    top: 2,
    bottom: 2,
  },
  halo: { position: 'absolute', top: -14, bottom: -14, left: -15, right: -15 },
  selection: { flex: 1, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: 'center' },
  content: { alignItems: 'center', gap: 2, paddingHorizontal: 5 },
  label: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
