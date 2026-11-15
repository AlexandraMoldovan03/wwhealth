/** Emergency guardians — mirror of backend/app/schemas/emergency_guardians.py. */
import type { EmergencyContact } from './medical';
import type { EmergencyData } from './emergency';

export interface GuardianInviteRequest {
  email: string;
  relation: string;
}

/** Patient side: someone I invited (pending), who accepted (active) or who declined (shown until re-invited). */
export interface GuardianLink {
  id: string;
  email: string;
  relation: string;
  status: 'pending' | 'active' | 'declined';
  guardianName: string | null;
  createdAt: string;
  respondedAt: string | null;
}

/** Guardian side: a pending invitation sent to my confirmed email. */
export interface GuardianInvitation {
  id: string;
  patientName: string;
  relation: string;
  createdAt: string;
}

/** Guardian side: someone I am an active emergency contact for. */
export interface ProtectedPatient {
  id: string;
  patientId: string;
  patientName: string;
  relation: string;
  since: string | null;
}

export interface GuardianOverview {
  guardians: GuardianLink[];
  invitations: GuardianInvitation[];
  protecting: ProtectedPatient[];
}

/** ONLY emergency data (same as the doctor view) + the patient's name and emergency contact. */
export interface GuardianEmergencyView extends EmergencyData {
  patientName: string;
  emergencyContact: EmergencyContact | null;
}
