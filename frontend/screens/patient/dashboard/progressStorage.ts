import AsyncStorage from '@react-native-async-storage/async-storage';

/** Per-account UI flags on this device (no medical data): checklist hidden, AI summary opened. */
const hiddenKey = (userId: string) => `wwhealth.checklist.hidden.${userId}`;
const aiSeenKey = (userId: string) => `wwhealth.ai.opened.${userId}`;
const listeners = new Set<() => void>();

async function read(key: string) {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch {
    return false;
  }
}

async function write(key: string, on: boolean) {
  await (on ? AsyncStorage.setItem(key, '1') : AsyncStorage.removeItem(key)).catch(() => undefined);
  listeners.forEach((l) => l());
}

export const isChecklistHidden = (userId: string) => read(hiddenKey(userId));
export const setChecklistHidden = (userId: string, hidden: boolean) => write(hiddenKey(userId), hidden);
export const wasAiSummaryOpened = (userId: string) => read(aiSeenKey(userId));
export const markAiSummaryOpened = (userId: string) => write(aiSeenKey(userId), true);

/** Re-read the flags when another screen changes them (e.g. "Show checklist" in Profile). */
export function subscribeProgressFlags(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
