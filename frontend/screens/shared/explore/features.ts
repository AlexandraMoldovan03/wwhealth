/** Every WWHealth module, shown on Explore. Each card opens its screen. */
import type { Feature } from '@/types';

export const FEATURES: Feature[] = [
  { id: 'dashboard', title: 'Patient Dashboard', description: 'Overview of your health record.', icon: 'home-outline', category: 'Patient', route: '/', isAvailable: true },
  { id: 'profile', title: 'Medical Profile', description: 'Personal data, allergies, diagnoses, treatments.', icon: 'person-outline', category: 'Patient', route: '/patient/profile', isAvailable: true },
  { id: 'documents', title: 'Medical Documents', description: 'All uploaded documents and extracted data.', icon: 'folder-open-outline', category: 'Patient', route: '/patient/documents', isAvailable: true },
  { id: 'upload', title: 'Upload Document', description: 'Photograph a document; Gemini extracts the data.', icon: 'cloud-upload-outline', category: 'AI', route: '/patient/upload-document', isAvailable: true },
  { id: 'lungvision', title: 'LungVision AI', description: 'Chest X-ray analysis with DenseNet121 + Grad-CAM.', icon: 'scan-outline', category: 'AI', route: '/analysis', isAvailable: true },
  { id: 'xray-results', title: 'X-ray Results', description: 'Previous LungVision analyses.', icon: 'images-outline', category: 'AI', route: '/patient/xray-results', isAvailable: true },
  { id: 'history', title: 'Medical History', description: 'Timeline of visits, diagnoses and analyses.', icon: 'time-outline', category: 'Patient', route: '/history', isAvailable: true },
  { id: 'doctor-access', title: 'Doctor access', description: 'Share chosen sections with a verified doctor for 1 h, 24 h or 7 days. Revoke anytime.', icon: 'shield-checkmark-outline', category: 'Patient', route: '/patient/doctor-access', isAvailable: true },
  { id: 'intelligence', title: 'AI Medical Intelligence', description: 'Gemini summary of your record, safety items first, every claim linked to its source. Needs your consent.', icon: 'sparkles-outline', category: 'AI', route: '/patient/intelligence', isAvailable: true },
  { id: 'summary', title: 'Medical summary', description: 'Allergies, conditions, medication, latest labs and documents in one place.', icon: 'reader-outline', category: 'Patient', route: '/patient/summary', isAvailable: true },
  { id: 'emergency', title: 'Emergency Passport', description: 'Single-use 5-minute QR: blood type, allergies, conditions, medication.', icon: 'medkit-outline', category: 'Patient', route: '/patient/emergency', isAvailable: true },
  { id: 'doctor-dashboard', title: 'Doctor Dashboard', description: 'Doctor area (demo role).', icon: 'medkit-outline', category: 'Doctor', route: '/doctor', isAvailable: true },
  { id: 'emergency-scan', title: 'Emergency scan', description: 'Scan a patient emergency QR (doctor accounts).', icon: 'medkit-outline', category: 'Doctor', route: '/doctor/emergency', isAvailable: true },
  { id: 'doctor-patients', title: 'My patients', description: 'Patients who granted you access (doctor accounts).', icon: 'people-outline', category: 'Doctor', route: '/patients', isAvailable: true },
];
