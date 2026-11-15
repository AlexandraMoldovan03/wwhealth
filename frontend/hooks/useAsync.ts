import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AsyncStatus } from '@/types';
import { getErrorMessage } from '@/utils/errors';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  status: AsyncStatus;
  isLoading: boolean;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  /** Re-run the request (e.g. pull-to-refresh or "Try again"). Ignored while one is in flight. */
  reload: () => Promise<void>;
}

interface UseAsyncOptions {
  /** Load on mount (default true). */
  immediate?: boolean;
  /**
   * Reload when the screen regains focus (back from an edit / upload screen).
   * The first focus is skipped — the mount load already covers it — so a screen never fires twice.
   */
  refetchOnFocus?: boolean;
}

/**
 * Loads data from any async function and tracks loading / error state.
 *
 * const { data, isLoading, error, reload } = useAsync(getHistory, { refetchOnFocus: true });
 *
 * Pass a stable function (module-level or wrapped in useCallback).
 */
export function useAsync<T>(fn: () => Promise<T>, options: UseAsyncOptions = {}): UseAsyncResult<T> {
  const { immediate = true, refetchOnFocus = false } = options;
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    status: immediate ? 'loading' : 'idle',
    isLoading: immediate,
  });
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const focusedOnce = useRef(false);

  const reload = useCallback(() => {
    if (inFlight.current) return inFlight.current; // de-duplicate taps / focus + mount races
    setState((s) => ({ ...s, status: 'loading', isLoading: true, error: null }));
    const run = (async () => {
      try {
        const data = await fn();
        if (mounted.current) setState({ data, error: null, status: 'success', isLoading: false });
      } catch (err) {
        if (mounted.current) {
          setState((s) => ({ ...s, error: getErrorMessage(err), status: 'error', isLoading: false }));
        }
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [fn]);

  useEffect(() => {
    mounted.current = true;
    if (immediate) void reload();
    return () => {
      mounted.current = false;
    };
  }, [immediate, reload]);

  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus) return;
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        if (immediate) return;
      }
      void reload();
    }, [refetchOnFocus, immediate, reload]),
  );

  return { ...state, reload };
}
