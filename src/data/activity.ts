/** DEMO DATA — "Recent activity" on the patient dashboard. */
import type { ActivityItem } from '@/types';
import { minutesAgo } from '@/utils/format';

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: 'a1', title: 'LungVision analysis', subtitle: 'Chest X-ray · Normal (DEMO)', date: minutesAgo(60 * 24 * 3), icon: 'scan-outline' },
  { id: 'a2', title: 'Document analysed', subtitle: 'Complete blood count · Gemini (DEMO)', date: minutesAgo(60 * 24 * 10), icon: 'document-text-outline' },
  { id: 'a3', title: 'Passport shared', subtitle: 'Dr. Demo · 15 min access', date: minutesAgo(60 * 24 * 12), icon: 'qr-code-outline' },
];
