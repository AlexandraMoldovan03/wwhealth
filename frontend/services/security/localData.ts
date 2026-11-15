/** Sensitive data kept on this phone, removed at sign-out (the session itself is removed by Supabase). */
import { clearIntakes } from '@/screens/patient/voice-intake/intakeStorage';
import { setCareSummaryDraft } from '@/services/careSummaryDraft';
import { clearEmergencyToken } from '@/services/emergencyTokenStore';
import { setRemindersEnabled } from '@/services/medicationReminders';

import { setBiometricLockEnabled } from './biometrics';

export async function clearLocalSensitiveData(userId?: string): Promise<void> {
  setCareSummaryDraft(null);
  const tasks: Promise<unknown>[] = [setRemindersEnabled(false), setBiometricLockEnabled(false)];
  if (userId) tasks.push(clearEmergencyToken(userId), clearIntakes(userId));
  await Promise.allSettled(tasks);
}
