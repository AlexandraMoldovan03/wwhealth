import AsyncStorage from '@react-native-async-storage/async-storage';

import type { IntakeForm } from '@/types';

const PREFIX = 'wwhealth:voice-intake:';

export interface SavedIntake {
  userId: string;
  id: string;
  savedAt: string;
  form: IntakeForm;
}

export async function saveIntake(userId: string, form: IntakeForm): Promise<SavedIntake> {
  const savedAt = new Date().toISOString();
  const id = savedAt + '-' + Math.random().toString(36).slice(2);
  const entry = { userId, id, savedAt, form };
  await AsyncStorage.setItem(PREFIX + userId + ':' + id, JSON.stringify(entry));
  return entry;
}

export async function loadIntakes(userId: string): Promise<SavedIntake[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX + userId + ':'));
  if (!keys.length) return [];
  const entries = await AsyncStorage.multiGet(keys);
  return entries.flatMap(([, value]) => value ? [JSON.parse(value) as SavedIntake] : [])
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Logout: voice intakes are medical data kept only on this phone → removed with the session. */
export async function clearIntakes(userId: string): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX + userId + ':'));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
