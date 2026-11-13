/** DEMO DATA — "Recent activity" on Home. */
import type { ActivityItem } from '@/types';
import { minutesAgo } from '@/utils/format';

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: 'a1', title: 'Image analyzed', subtitle: 'street_scene.jpg · 4 labels', date: minutesAgo(12), icon: 'scan-outline' },
  { id: 'a2', title: 'Model updated', subtitle: 'demo-model-v0 deployed', date: minutesAgo(95), icon: 'rocket-outline' },
  { id: 'a3', title: 'Backend connected', subtitle: 'FastAPI health check OK', date: minutesAgo(60 * 26), icon: 'pulse-outline' },
];
