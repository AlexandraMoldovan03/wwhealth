import AsyncStorage from '@react-native-async-storage/async-storage';

/** Per-account flag on this device: the onboarding was completed or skipped. Contains no medical data. */
const key = (userId: string) => `wwhealth.onboarded.${userId}`;

export async function isOnboarded(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === '1';
  } catch {
    return true; // storage unavailable → never block the app
  }
}

export async function setOnboarded(userId: string): Promise<void> {
  await AsyncStorage.setItem(key(userId), '1').catch(() => undefined);
}
