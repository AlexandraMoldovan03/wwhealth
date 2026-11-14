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
  /** Which roles see this tab (role comes from Supabase). */
  roles: ('patient' | 'doctor')[];
}

export const TABS: TabConfig[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home', roles: ['patient', 'doctor'] },
  { name: 'history', title: 'Timeline', icon: 'time-outline', iconFocused: 'time', roles: ['patient'] },
  { name: 'analysis', title: 'LungVision', icon: 'scan-outline', iconFocused: 'scan', roles: ['patient'] },
  { name: 'scan', title: 'Scan QR', icon: 'qr-code-outline', iconFocused: 'qr-code', roles: ['doctor'] },
  { name: 'access', title: 'Accesses', icon: 'shield-checkmark-outline', iconFocused: 'shield-checkmark', roles: ['doctor'] },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconFocused: 'compass', roles: ['patient'] },
  { name: 'settings', title: 'Profile', icon: 'person-circle-outline', iconFocused: 'person-circle', roles: ['patient', 'doctor'] },
];

/** `name` = route file path inside app/ without extension. */
export const STACK_SCREENS: { name: string; title: string }[] = [
  // Auth
  { name: 'login', title: 'Sign in' },
  { name: 'register', title: 'Create account' },
  { name: 'auth/callback', title: 'Signing in' },
  { name: 'history/[id]', title: 'Details' },
  // Patient
  { name: 'patient/intake', title: 'Voice Intake' },
  { name: 'patient/profile', title: 'Medical Profile' },
  { name: 'patient/edit-profile', title: 'Edit Medical Profile' },
  { name: 'patient/document/[id]', title: 'Document' },
  { name: 'patient/documents', title: 'Medical Documents' },
  { name: 'patient/upload-document', title: 'Upload Document' },
  { name: 'patient/xray-results', title: 'X-ray Results' },
  { name: 'patient/passport', title: 'Medical Passport' },
  { name: 'patient/emergency', title: 'Emergency Passport' },
  { name: 'patient/lab-review/[id]', title: 'Lab values' },
  { name: 'patient/lab-trend', title: 'Lab trend' },
  // Doctor
  { name: 'doctor/index', title: 'Doctor' },
  { name: 'doctor/scan', title: 'QR Scanner' },
  { name: 'doctor/emergency', title: 'Emergency scan' },
  { name: 'doctor/patient/[id]/index', title: 'Patient Summary' },
  { name: 'doctor/patient/[id]/documents', title: 'Patient Documents' },
  { name: 'doctor/patient/[id]/lungvision', title: 'LungVision Results' },
  { name: '+not-found', title: 'Not found' },
];
