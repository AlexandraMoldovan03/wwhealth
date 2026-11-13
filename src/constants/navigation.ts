/**
 * NAVIGATION CONFIG
 * - TABS: the bottom tabs, in order. To add a tab: add an entry here AND create `app/(tabs)/<name>.tsx`.
 * - STACK_SCREENS: header titles for pages that open on top of the tabs (app/patient/*, app/doctor/*).
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
  { name: 'analysis', title: 'LungVision', icon: 'scan-outline', iconFocused: 'scan' },
  { name: 'history', title: 'History', icon: 'time-outline', iconFocused: 'time' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconFocused: 'settings' },
];

/** `name` = route file path inside app/ without extension. */
export const STACK_SCREENS: { name: string; title: string }[] = [
  // Auth
  { name: 'login', title: 'Sign in' },
  { name: 'register', title: 'Create account' },
  { name: 'history/[id]', title: 'Details' },
  // Patient
  { name: 'patient/profile', title: 'Medical Profile' },
  { name: 'patient/documents', title: 'Medical Documents' },
  { name: 'patient/upload-document', title: 'Upload Document' },
  { name: 'patient/xray-results', title: 'X-ray Results' },
  { name: 'patient/passport', title: 'Medical Passport' },
  // Doctor
  { name: 'doctor/index', title: 'Doctor' },
  { name: 'doctor/scan', title: 'QR Scanner' },
  { name: 'doctor/patient/[id]/index', title: 'Patient Summary' },
  { name: 'doctor/patient/[id]/documents', title: 'Patient Documents' },
  { name: 'doctor/patient/[id]/lungvision', title: 'LungVision Results' },
  { name: '+not-found', title: 'Not found' },
];
