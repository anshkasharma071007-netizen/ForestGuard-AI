import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/services/api';

export type Resource<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error' | 'unavailable'; message: string };

export function usePublicData<T>(fetchData: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [state, setState] = useState<Resource<T>>({ kind: 'loading' });
  const request = useRef<AbortController | null>(null);

  const reload = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'loading' });
    void fetchData(controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ kind: 'ready', data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const kind = error instanceof ApiError && error.kind === 'unavailable' ? 'unavailable' : 'error';
      setState({ kind, message: error instanceof Error ? error.message : 'The request failed. Try again.' });
    });
  }, [fetchData]);

  useEffect(() => {
    if (enabled) reload();
    return () => request.current?.abort();
  }, [enabled, reload]);

  return { state, reload };
}
