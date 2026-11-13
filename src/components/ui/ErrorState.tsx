import { AppButton } from './AppButton';
import { StateView } from './StateView';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <StateView icon="alert-circle-outline" title={title} message={message} tone="danger">
      {onRetry && <AppButton title="Try again" variant="outline" size="sm" icon="refresh" onPress={onRetry} />}
    </StateView>
  );
}
