import type { IconName } from './icons';

export type HistoryStatus = 'completed' | 'processing' | 'failed';

export interface HistoryItem {
  id: string;
  title: string;
  description: string;
  date: string; // ISO date
  status: HistoryStatus;
  icon: IconName;
  /** Free-form key/value details shown on the detail screen. */
  details: Record<string, string>;
}

export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  date: string; // ISO date
  icon: IconName;
}
