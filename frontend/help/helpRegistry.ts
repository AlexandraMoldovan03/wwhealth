/**
 * CONTEXTUAL HELP — registry of help topics, one per main screen.
 * Text lives in i18n (`help.topics.<topic>`: title, intro, can[], steps[], faq[{ q, a }]) → works offline, RO / EN.
 * Links below open the related features. Static content only: no AI is used to write or serve it.
 */
import type { Href } from 'expo-router';

import type { IconName } from '@/types';

export type HelpTopic =
  | 'home'
  | 'records'
  | 'insights'
  | 'transfer'
  | 'profile'
  | 'medicalProfile'
  | 'documents'
  | 'upload'
  | 'timeline'
  | 'labs'
  | 'lungvision'
  | 'intelligence'
  | 'emergency'
  | 'doctorAccess'
  | 'intake'
  | 'doctorHome'
  | 'doctorPatients'
  | 'doctorScan'
  | 'doctorRecords'
  | 'doctorPatient';

export interface HelpLink {
  /** Label key: `help.links.<id>`. */
  id: string;
  icon: IconName;
  route: Href;
}

const L = {
  profile: { id: 'profile', icon: 'person-outline', route: '/patient/profile' },
  editProfile: { id: 'editProfile', icon: 'create-outline', route: '/patient/edit-profile' },
  documents: { id: 'documents', icon: 'folder-open-outline', route: '/patient/documents' },
  upload: { id: 'upload', icon: 'cloud-upload-outline', route: '/patient/upload-document' },
  timeline: { id: 'timeline', icon: 'time-outline', route: '/history' },
  intake: { id: 'intake', icon: 'mic-outline', route: '/patient/intake' },
  intelligence: { id: 'intelligence', icon: 'sparkles-outline', route: '/patient/intelligence' },
  lungvision: { id: 'lungvision', icon: 'scan-outline', route: '/analysis' },
  xrays: { id: 'xrays', icon: 'images-outline', route: '/patient/xray-results' },
  emergency: { id: 'emergency', icon: 'medkit-outline', route: '/patient/emergency' },
  doctorAccess: { id: 'doctorAccess', icon: 'shield-checkmark-outline', route: '/patient/doctor-access' },
  summary: { id: 'summary', icon: 'reader-outline', route: '/patient/summary' },
  explore: { id: 'explore', icon: 'compass-outline', route: '/explore' },
  doctorPatients: { id: 'doctorPatients', icon: 'people-outline', route: '/patients' },
  doctorScan: { id: 'doctorScan', icon: 'qr-code-outline', route: '/scan' },
  doctorRecords: { id: 'doctorRecords', icon: 'folder-open-outline', route: '/files' },
  accessLog: { id: 'accessLog', icon: 'shield-checkmark-outline', route: '/access' },
} satisfies Record<string, HelpLink>;

export const HELP_LINKS: Record<HelpTopic, HelpLink[]> = {
  home: [L.editProfile, L.upload, L.intelligence, L.emergency],
  records: [L.profile, L.documents, L.timeline, L.intake],
  insights: [L.intelligence, L.lungvision, L.xrays],
  transfer: [L.emergency, L.doctorAccess, L.summary],
  profile: [L.profile, L.doctorAccess, L.explore],
  medicalProfile: [L.editProfile, L.summary, L.emergency],
  documents: [L.upload, L.timeline, L.intelligence],
  upload: [L.documents, L.timeline],
  timeline: [L.documents, L.upload, L.profile],
  labs: [L.documents, L.timeline],
  lungvision: [L.xrays, L.intelligence],
  intelligence: [L.profile, L.documents, L.doctorAccess],
  emergency: [L.profile, L.doctorAccess],
  doctorAccess: [L.summary, L.emergency],
  intake: [L.profile, L.timeline],
  doctorHome: [L.doctorScan, L.doctorPatients, L.doctorRecords],
  doctorPatients: [L.doctorRecords, L.doctorScan],
  doctorScan: [L.accessLog, L.doctorPatients],
  doctorRecords: [L.doctorPatients, L.accessLog],
  doctorPatient: [L.doctorPatients, L.doctorRecords],
};
