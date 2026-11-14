/** Shortcuts on the patient dashboard. Add one here to add a button. */
import type { Href } from 'expo-router';

import type { IconName } from '@/types';

export type QuickActionTone = 'sage' | 'blue' | 'coral' | 'teal';

export interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  route: Href;
  tone: QuickActionTone;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'profile', title: 'Medical profile', subtitle: 'Allergies, conditions', icon: 'person-outline', route: '/patient/profile', tone: 'sage' },
  { id: 'documents', title: 'Documents', subtitle: 'Upload & view', icon: 'folder-open-outline', route: '/patient/documents', tone: 'blue' },
  { id: 'lungvision', title: 'LungVision AI', subtitle: 'Chest X-ray', icon: 'scan-outline', route: '/analysis', tone: 'teal' },
  { id: 'history', title: 'Timeline', subtitle: 'Your medical history', icon: 'time-outline', route: '/history', tone: 'coral' },
];
