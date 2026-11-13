import type { IconName } from './icons';

/** Row in Home → "Recent activity" (demo). */
export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  date: string; // ISO date
  icon: IconName;
}
