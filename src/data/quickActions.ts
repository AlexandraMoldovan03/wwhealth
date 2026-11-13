/** Shortcuts on the patient dashboard. Add one here to add a button. */
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
  { id: 'profile', title: 'Medical profile', subtitle: 'Allergies, diagnoses', icon: 'person-outline', route: '/patient/profile' },
  { id: 'documents', title: 'Documents', subtitle: 'Upload & analyse', icon: 'folder-open-outline', route: '/patient/documents' },
  { id: 'lungvision', title: 'LungVision AI', subtitle: 'Chest X-ray', icon: 'scan-outline', route: '/analysis' },
  { id: 'passport', title: 'QR Passport', subtitle: 'Share with a doctor', icon: 'qr-code-outline', route: '/patient/passport' },
];
