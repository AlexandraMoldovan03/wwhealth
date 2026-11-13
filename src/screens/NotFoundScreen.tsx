import { router } from 'expo-router';

import { EmptyState, ScreenContainer } from '@/components/ui';

export function NotFoundScreen() {
  return (
    <ScreenContainer scroll={false}>
      <EmptyState
        icon="help-circle-outline"
        title="Page not found"
        message="This screen doesn't exist."
        actionLabel="Go home"
        onAction={() => router.replace('/')}
      />
    </ScreenContainer>
  );
}
