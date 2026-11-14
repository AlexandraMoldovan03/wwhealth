/** Formats an ISO date as e.g. "12 Nov 2026, 14:30". */
import { currentLocale, i18n } from '@/i18n';

export function formatDateTime(iso: string): string {
  // A date without a time (analysis date "2026-10-02") has no hour to show — "02:00" would be invented.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDate(iso);
  const date = new Date(iso);
  return date.toLocaleString(currentLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Calendar date only, e.g. "12 nov. 2026". A plain yyyy-mm-dd is read as a local date (no timezone shift). */
export function formatDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return date.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", or a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return i18n.t('time.justNow');
  if (diffMin < 60) return i18n.t('time.minAgo', { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return i18n.t('time.hAgo', { count: diffH });
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return i18n.t('time.dAgo', { count: diffD });
  return new Date(iso).toLocaleDateString(currentLocale());
}

/** 0.873 → "87%" */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Returns an ISO string `minutesAgo` minutes in the past (handy for demo data). */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** 2_400_000 → "2.3 MB", 12_000 → "12 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
