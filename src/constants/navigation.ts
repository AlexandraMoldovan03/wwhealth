/**
 * TAB CONFIG — the bottom tabs, in order.
 * To add a tab: add an entry here AND create `app/(tabs)/<name>.tsx`.
 */
import type { IconName } from '@/types';

export interface TabConfig {
  /** File name in app/(tabs)/ without extension. */
  name: string;
  title: string;
  icon: IconName;
  iconFocused: IconName;
}

export const TABS: TabConfig[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconFocused: 'compass' },
  { name: 'analysis', title: 'AI', icon: 'sparkles-outline', iconFocused: 'sparkles' },
  { name: 'history', title: 'History', icon: 'time-outline', iconFocused: 'time' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconFocused: 'settings' },
];
