import type { ThemeColors } from '@/constants/theme';
import type { HistoryStatus } from '@/types';

/** Maps a status to its label and theme colour. */
export function getStatusStyle(status: HistoryStatus, colors: ThemeColors): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: colors.success };
    case 'processing':
      return { label: 'Processing', color: colors.warning };
    case 'failed':
      return { label: 'Failed', color: colors.danger };
  }
}
