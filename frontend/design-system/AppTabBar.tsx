/**
 * Bottom navigation — docked (never covers content), safe-area aware, role specific.
 * Active tab = solid pill behind the icon + bold label in the text colour; animated with Reanimated
 * (instant when Reduce Motion is on) and a light haptic tick on iOS / Android.
 */
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pressSpring, tapFeedback } from './motion';
import { TABS, type TabConfig } from '@/config/navigation';
import { fonts, radius, shadows, spacing } from './theme';
import { useRole } from '@/services/auth/useCurrentUser';
import { useTheme } from './useTheme';

export function AppTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const role = useRole();

  const items = state.routes
    .map((route, index) => ({ route, index, tab: TABS.find((t) => t.name === route.name) }))
    .filter((it): it is typeof it & { tab: TabConfig } => !!it.tab && !it.tab.parent && it.tab.roles.includes(role));

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBar,
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, spacing.sm + 4),
        },
        !isDark && shadows.raised,
      ]}
    >
      {items.map(({ route, index, tab }) => {
        // A hidden route (e.g. /history inside "My record") keeps its section highlighted.
        const current = TABS.find((t) => t.name === state.routes[state.index]?.name);
        const focused = state.index === index || current?.parent === tab.name;
        const options = descriptors[route.key]?.options;
        const label = typeof options?.title === 'string' ? options.title : tab.title;
        return (
          <TabItem
            key={route.key}
            label={label}
            icon={focused ? tab.iconFocused : tab.icon}
            focused={focused}
            activeColor={role === 'doctor' ? colors.accent : colors.primary}
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
  const progress = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.set(reduceMotion ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: 260 }));
  }, [focused, reduceMotion, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.6, 1]) }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }, { translateY: interpolate(progress.value, [0, 1], [0, -1]) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        if (!reduceMotion) press.set(withSpring(0.9, pressSpring));
      }}
      onPressOut={() => press.set(withSpring(1, pressSpring))}
      style={styles.item}
      hitSlop={4}
    >
      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.iconWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.pill, { backgroundColor: activeColor }, pillStyle]} />
          <Ionicons name={icon} size={21} color={focused ? colors.onPrimary : colors.textMuted} />
        </View>
        <Animated.Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={[styles.label, { color: focused ? colors.text : colors.textMuted, fontFamily: focused ? fonts.bodyBold : fonts.bodyMedium }]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
  },
  item: { flex: 1, alignItems: 'center', minHeight: 54 },
  content: { alignItems: 'center', gap: 4 },
  iconWrap: { width: 54, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.pill },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
});
