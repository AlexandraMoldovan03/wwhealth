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
  /** Which roles may open this tab (role comes from Supabase); other roles are redirected. */
  roles: ('patient' | 'doctor')[];
  /** Kept out of the bottom bar (opened from a hub); `parent` stays highlighted while it is open. */
  parent?: string;
}

/**
 * Patient story: COLLECT (My record) → UNDERSTAND (AI Medical Insights) → CONTROL / CONNECT (Transfer & Access).
 * Doctor: Dashboard · Authorised patients · Scan QR · Medical records · Profile.
 * Older tab routes (/history, /analysis, /explore, /access) still work; they open inside their section.
 */
export const TABS: TabConfig[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home', roles: ['patient', 'doctor'] },
  { name: 'records', title: 'My record', icon: 'folder-open-outline', iconFocused: 'folder-open', roles: ['patient'] },
  { name: 'insights', title: 'AI Insights', icon: 'sparkles-outline', iconFocused: 'sparkles', roles: ['patient'] },
  { name: 'transfer', title: 'Transfer & Access', icon: 'swap-horizontal-outline', iconFocused: 'swap-horizontal', roles: ['patient'] },
  { name: 'patients', title: 'Patients', icon: 'people-outline', iconFocused: 'people', roles: ['doctor'] },
  { name: 'scan', title: 'Scan QR', icon: 'qr-code-outline', iconFocused: 'qr-code', roles: ['doctor'] },
  { name: 'files', title: 'Records', icon: 'folder-open-outline', iconFocused: 'folder-open', roles: ['doctor'] },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconFocused: 'settings', roles: ['patient', 'doctor'] },
  // Reached from the hubs above (never in the bar).
  { name: 'history', title: 'Timeline', icon: 'time-outline', iconFocused: 'time', roles: ['patient'], parent: 'records' },
  { name: 'analysis', title: 'LungVision', icon: 'scan-outline', iconFocused: 'scan', roles: ['patient'], parent: 'insights' },
  { name: 'explore', title: 'Explore', icon: 'compass-outline', iconFocused: 'compass', roles: ['patient', 'doctor'], parent: 'settings' },
  { name: 'access', title: 'Accesses', icon: 'shield-checkmark-outline', iconFocused: 'shield-checkmark', roles: ['doctor'], parent: 'files' },
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
  { name: 'patient/doctor-access', title: 'Doctor access' },
  { name: 'patient/grant-access', title: 'Grant access' },
  { name: 'patient/summary', title: 'Medical summary' },
  { name: 'patient/intelligence', title: 'AI Medical Intelligence' },
  { name: 'patient/emergency', title: 'Emergency Passport' },
  { name: 'patient/lab-review/[id]', title: 'Lab values' },
  { name: 'patient/import/[id]', title: 'Check import' },
  { name: 'patient/lab-trend', title: 'Lab trend' },
  { name: 'patient/smart-care', title: 'Smart Care' },
  { name: 'patient/specialties', title: 'Find a specialty' },
  { name: 'patient/specialty/[id]', title: 'Doctors' },
  { name: 'patient/book/[doctorId]', title: 'Book' },
  { name: 'patient/appointments', title: 'My appointments' },
  { name: 'patient/treatments', title: 'My treatments' },
  { name: 'patient/record', title: 'Smart record' },
  { name: 'patient/prepare/[id]', title: 'Prepare consultation' },
  // Doctor
  { name: 'doctor/index', title: 'Doctor' },
  { name: 'doctor/emergency', title: 'Emergency scan' },
  { name: 'doctor/appointments', title: 'Appointments' },
  { name: 'doctor/agenda', title: 'My agenda' },
  { name: 'doctor/schedule', title: 'Work schedule' },
  { name: 'doctor/consultation/[id]', title: 'Consultation sheet' },
  { name: 'doctor/treatment', title: 'Treatment' },
  { name: 'doctor/patient/[id]/index', title: 'Patient Summary' },
  { name: 'doctor/patient/[id]/documents', title: 'Patient Documents' },
  { name: 'doctor/patient/[id]/labs', title: 'Lab history' },
  { name: 'doctor/patient/[id]/intelligence', title: 'AI Medical Intelligence' },
  { name: 'doctor/patient/[id]/document/[docId]', title: 'Document' },
  { name: '+not-found', title: 'Not found' },
];
