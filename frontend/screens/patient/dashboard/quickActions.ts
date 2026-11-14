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
  { id: 'upload', title: 'Upload document', subtitle: 'Photo or PDF', icon: 'cloud-upload-outline', route: '/patient/upload-document', tone: 'blue' },
  { id: 'intake', title: 'Voice intake', subtitle: 'Describe your symptoms', icon: 'mic-outline', route: '/patient/intake', tone: 'sage' },
  { id: 'intelligence', title: 'AI summary', subtitle: 'Safety first, with sources', icon: 'sparkles-outline', route: '/patient/intelligence', tone: 'blue' },
  { id: 'doctorAccess', title: 'Share with a doctor', subtitle: 'You choose what and how long', icon: 'shield-checkmark-outline', route: '/patient/doctor-access', tone: 'teal' },
  { id: 'profile', title: 'Medical profile', subtitle: 'Allergies, conditions', icon: 'person-outline', route: '/patient/profile', tone: 'sage' },
  { id: 'history', title: 'Timeline', subtitle: 'Your medical history', icon: 'time-outline', route: '/history', tone: 'coral' },
];
