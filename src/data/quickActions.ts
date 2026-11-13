/** DEMO DATA — the big buttons on Home. Add one here to add a shortcut. */
import type { Href } from 'expo-router';

import type { IconName } from '@/types';

export interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  route: Href;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'analyze', title: 'Analyze image', subtitle: 'AI vision demo', icon: 'scan-outline', route: '/analysis' },
  { id: 'explore', title: 'Explore', subtitle: 'All features', icon: 'compass-outline', route: '/explore' },
  { id: 'history', title: 'History', subtitle: 'Past results', icon: 'time-outline', route: '/history' },
  { id: 'settings', title: 'Settings', subtitle: 'Theme & config', icon: 'settings-outline', route: '/settings' },
];
