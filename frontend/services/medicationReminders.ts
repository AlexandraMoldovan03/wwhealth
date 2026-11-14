/**
 * Local medication reminders (expo-notifications, works in Expo Go — local only, no push).
 *
 * - Doses come from the backend (`getReminderSchedule`): documented fixed times only, computed in the device's IANA
 *   timezone (DST-safe). "As needed" / undocumented schedules never get a reminder.
 * - Lock-screen privacy: the notification text is generic ("Medication reminder") — no medication name, dose or
 *   condition. Details are shown only inside the app.
 * - Rebuilt when the plans change (`plansHash`), the timezone changes, or the day rolls over; our old notifications
 *   are always cancelled first. iOS keeps at most 64 pending local notifications → we schedule ≤ 60 (7 days).
 * - Snooze = one extra one-off notification; it never changes the prescription or the dose time.
 * - The on/off switch lives on this device (AsyncStorage, no medical data).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCalendars } from 'expo-localization';
import { Platform } from 'react-native';

import type { DoseSchedule } from '@/types';

type Notifications = typeof import('expo-notifications');

const ENABLED_KEY = 'wwhealth.reminders.enabled';
const STATE_KEY = 'wwhealth.reminders.state';
const KIND = 'wwhealth.dose';
const MAX = 60;

let mod: Notifications | null | undefined;
async function notifications(): Promise<Notifications | null> {
  if (Platform.OS === 'web') return null;
  if (mod === undefined) {
    try {
      mod = await import('expo-notifications');
      mod.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
    } catch {
      mod = null;
    }
  }
  return mod;
}

export const remindersSupported = () => Platform.OS !== 'web';

/** The device's IANA timezone (e.g. Europe/Bucharest). */
export function deviceTimezone(): string {
  try {
    return getCalendars()[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function remindersEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

async function cancelOurs(n: Notifications) {
  const pending = await n.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending.filter((p) => p.content.data?.kind === KIND).map((p) => n.cancelScheduledNotificationAsync(p.identifier)),
  );
}

export type ReminderText = { title: string; body: string };

/**
 * Turn reminders on/off. Turning on asks for permission; returns false if the user denied it.
 * Turning off cancels every reminder WWHealth scheduled.
 */
export async function setRemindersEnabled(on: boolean): Promise<boolean> {
  const n = await notifications();
  if (!n) return false;
  if (on) {
    const current = await n.getPermissionsAsync();
    const granted = current.granted || (await n.requestPermissionsAsync()).granted;
    if (!granted) return false;
    await AsyncStorage.setItem(ENABLED_KEY, '1').catch(() => undefined);
  } else {
    await AsyncStorage.removeItem(ENABLED_KEY).catch(() => undefined);
    await AsyncStorage.removeItem(STATE_KEY).catch(() => undefined);
    await cancelOurs(n);
  }
  return true;
}

const dayKey = () => new Date().toDateString();

/**
 * (Re)schedule from the backend schedule. Skips work when nothing changed (same plans, timezone and day).
 * `force` rebuilds anyway (e.g. after marking a dose).
 */
export async function syncReminders(schedule: DoseSchedule, text: ReminderText, force = false): Promise<number> {
  const n = await notifications();
  if (!n || !(await remindersEnabled())) return 0;
  const doseKeys = schedule.doses.filter((d) => d.status === 'pending').map((d) => `${d.planId}@${d.scheduledFor}`).join(',');
  const state = `${schedule.plansHash}|${schedule.timezone}|${dayKey()}|${doseKeys.length}`;
  if (!force && (await AsyncStorage.getItem(STATE_KEY).catch(() => null)) === state) return -1;
  await cancelOurs(n);
  const now = Date.now();
  const doses = schedule.doses
    .filter((d) => d.status === 'pending' && new Date(d.scheduledFor).getTime() > now + 30_000)
    .slice(0, MAX);
  for (const d of doses) {
    await n.scheduleNotificationAsync({
      // Generic text only: nothing sensitive on the lock screen.
      content: { title: text.title, body: text.body, data: { kind: KIND, planId: d.planId, scheduledFor: d.scheduledFor } },
      trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: new Date(d.scheduledFor) },
    });
  }
  await AsyncStorage.setItem(STATE_KEY, state).catch(() => undefined);
  return doses.length;
}

/** One extra reminder in `minutes` — the documented dose time and the prescription stay unchanged. */
export async function snoozeReminder(planId: string, scheduledFor: string, minutes: number, text: ReminderText): Promise<boolean> {
  const n = await notifications();
  if (!n || !(await remindersEnabled())) return false;
  await n.scheduleNotificationAsync({
    content: { title: text.title, body: text.body, data: { kind: KIND, planId, scheduledFor, snooze: true } },
    trigger: { type: n.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(60, minutes * 60) },
  });
  return true;
}
