/** Formats an ISO date as e.g. "12 Nov 2026, 14:30". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", or a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** 0.873 → "87%" */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Returns an ISO string `minutesAgo` minutes in the past (handy for demo data). */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
