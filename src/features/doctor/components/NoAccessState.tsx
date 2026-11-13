import { router } from 'expo-router';

import { EmptyState } from '@/components/ui';

export function NoAccessState() {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title="No active access"
      message="Access expired or the app was reloaded. Scan the patient's QR passport again."
      actionLabel="Scan QR"
      onAction={() => router.replace('/doctor/scan')}
    />
  );
}
