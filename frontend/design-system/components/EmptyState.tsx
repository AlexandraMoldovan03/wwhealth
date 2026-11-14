import type { IconName } from '@/types';

import { AppButton } from './AppButton';
import { StateView } from './StateView';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, icon = 'file-tray-outline', actionLabel, onAction }: EmptyStateProps) {
  return (
    <StateView icon={icon} title={title} message={message}>
      {actionLabel && onAction && <AppButton title={actionLabel} variant="secondary" size="sm" onPress={onAction} />}
    </StateView>
  );
}
