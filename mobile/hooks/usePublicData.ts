import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/services/api';

export type Resource<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error' | 'unavailable'; message: string };

export function usePublicData<T>(fetchData: (signal: AbortSignal) => Promise<T>, enabled = true, intervalMs = 0) {
  const [snapshot, setSnapshot] = useState<{ fetchData: typeof fetchData; state: Resource<T>; error?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<{ controller: AbortController; done: Promise<void> } | null>(null);

  const reload = useCallback(() => {
    if (request.current) return request.current.done;
    const controller = new AbortController();
    setRefreshing(true);
    setSnapshot((previous) => previous?.fetchData === fetchData && previous.state.kind === 'ready'
      ? previous : { fetchData, state: { kind: 'loading' } });
    const done = fetchData(controller.signal).then((data) => {
      if (!controller.signal.aborted) setSnapshot({ fetchData, state: { kind: 'ready', data } });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const kind = error instanceof ApiError && error.kind === 'unavailable' ? 'unavailable' : 'error';
      const message = error instanceof Error ? error.message : 'The request failed. Try again.';
      setSnapshot((previous) => previous?.fetchData === fetchData && previous.state.kind === 'ready'
        ? { ...previous, error: message } : { fetchData, state: { kind, message } });
    }).finally(() => {
      if (request.current?.controller === controller) {
        request.current = null;
        setRefreshing(false);
      }
    });
    request.current = { controller, done };
    return done;
  }, [fetchData]);

  useEffect(() => {
    if (enabled) void reload();
    else setRefreshing(false);
    const timer = enabled && intervalMs ? setInterval(reload, intervalMs) : undefined;
    return () => {
      clearInterval(timer);
      request.current?.controller.abort();
      request.current = null;
    };
  }, [enabled, reload, intervalMs]);

  const current = snapshot?.fetchData === fetchData ? snapshot : undefined;
  const state: Resource<T> = current?.state ?? { kind: 'loading' };
  const revalidate = useCallback(async (signal: AbortSignal) => {
    await request.current?.done;
    if (!signal.aborted) await reload();
  }, [reload]);
  return { state, reload, revalidate, refreshing, refreshError: current?.error };
}
