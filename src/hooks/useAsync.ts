import { useCallback, useEffect, useRef, useState } from 'react';

import type { AsyncStatus } from '@/types';
import { getErrorMessage } from '@/utils/errors';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  status: AsyncStatus;
  isLoading: boolean;
}

interface UseAsyncResult<T> extends AsyncState<T> {
  /** Re-run the request (e.g. pull-to-refresh or "Try again"). */
  reload: () => Promise<void>;
}

/**
 * Loads data from any async function and tracks loading / error state.
 *
 * const { data, isLoading, error, reload } = useAsync(getHistory);
 *
 * Pass a stable function (module-level or wrapped in useCallback).
 */
export function useAsync<T>(fn: () => Promise<T>, options: { immediate?: boolean } = {}): UseAsyncResult<T> {
  const { immediate = true } = options;
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    status: immediate ? 'loading' : 'idle',
    isLoading: immediate,
  });
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', isLoading: true, error: null }));
    try {
      const data = await fn();
      if (mounted.current) setState({ data, error: null, status: 'success', isLoading: false });
    } catch (err) {
      if (mounted.current) {
        setState((s) => ({ ...s, error: getErrorMessage(err), status: 'error', isLoading: false }));
      }
    }
  }, [fn]);

  useEffect(() => {
    mounted.current = true;
    if (immediate) void reload();
    return () => {
      mounted.current = false;
    };
  }, [immediate, reload]);

  return { ...state, reload };
}
