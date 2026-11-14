import { useCallback, useState } from 'react';

import type { AsyncStatus } from '@/types';
import { getErrorMessage } from '@/utils/errors';

/**
 * For actions triggered by the user (button press): tracks loading / error / result.
 *
 * const { run, data, isLoading, error } = useSubmit(api.analyzeXray);
 * <AppButton loading={isLoading} onPress={() => run(file)} />
 */
export function useSubmit<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AsyncStatus>('idle');

  const run = useCallback(
    async (...args: Args): Promise<T | null> => {
      setStatus('loading');
      setError(null);
      try {
        const result = await fn(...args);
        setData(result);
        setStatus('success');
        return result;
      } catch (err) {
        setError(getErrorMessage(err));
        setStatus('error');
        return null;
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setStatus('idle');
  }, []);

  return { run, reset, data, error, status, isLoading: status === 'loading' };
}
