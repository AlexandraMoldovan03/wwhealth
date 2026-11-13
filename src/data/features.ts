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
  { id: 'passport', title: 'Medical Passport QR', description: 'Temporary QR access for a doctor.', icon: 'qr-code-outline', category: 'Patient', route: '/patient/passport', isAvailable: true },
  { id: 'doctor-dashboard', title: 'Doctor Dashboard', description: 'Doctor area (demo role).', icon: 'medkit-outline', category: 'Doctor', route: '/doctor', isAvailable: true },
  { id: 'qr-scanner', title: 'QR Scanner', description: 'Scan a patient passport to get access.', icon: 'scan-circle-outline', category: 'Doctor', route: '/doctor/scan', isAvailable: true },
];
