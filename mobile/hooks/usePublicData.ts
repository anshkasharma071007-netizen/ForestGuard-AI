import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/services/api';

export type Resource<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error' | 'unavailable'; message: string };

export function usePublicData<T>(fetchData: (signal: AbortSignal) => Promise<T>, enabled = true, intervalMs = 0) {
  const [snapshot, setSnapshot] = useState<{ fetchData: typeof fetchData; state: Resource<T>; error?: string }>();
  const [refreshing, setRefreshing] = useState<typeof fetchData | null>(null);
  const scope = useRef<{
    fetchData: typeof fetchData;
    enabled: boolean;
    request?: { controller: AbortController; done: Promise<void> };
  } | null>(null);

  const reload = useCallback(() => {
    const current = scope.current;
    if (!current?.enabled || current.fetchData !== fetchData) return;
    if (current.request) return current.request.done;
    const controller = new AbortController();
    setRefreshing(() => fetchData);
    setSnapshot((previous) => previous?.fetchData === fetchData && previous.state.kind === 'ready'
      ? previous : { fetchData, state: { kind: 'loading' } });
    const done = fetchData(controller.signal).then((data) => {
      if (!controller.signal.aborted) setSnapshot({ fetchData, state: { kind: 'ready', data } });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof ApiError && error.kind === 'cancelled')) return;
      const kind = error instanceof ApiError && error.kind === 'unavailable' ? 'unavailable' : 'error';
      const message = error instanceof Error ? error.message : 'The request failed. Try again.';
      setSnapshot((previous) => previous?.fetchData === fetchData && previous.state.kind === 'ready'
        ? { ...previous, error: message } : { fetchData, state: { kind, message } });
    }).finally(() => {
      if (scope.current === current) {
        current.request = undefined;
        setRefreshing(null);
      }
    });
    current.request = { controller, done };
    return done;
  }, [fetchData]);

  useEffect(() => {
    const current: NonNullable<typeof scope.current> = { fetchData, enabled: false };
    scope.current = current;
    return () => {
      scope.current = null;
      current.request?.controller.abort();
    };
  }, [fetchData]);

  useEffect(() => {
    const current = scope.current;
    if (!enabled || !current) return;
    current.enabled = true;
    void reload();
    const timer = intervalMs ? setInterval(reload, intervalMs) : undefined;
    return () => {
      // Pause polling on blur or backgrounding and let the current query finish.
      current.enabled = false;
      clearInterval(timer);
    };
  }, [enabled, reload, intervalMs]);

  const current = snapshot?.fetchData === fetchData ? snapshot : undefined;
  const state: Resource<T> = current?.state ?? { kind: 'loading' };
  const revalidate = useCallback(async (signal: AbortSignal) => {
    if (scope.current?.fetchData !== fetchData) return;
    await scope.current.request?.done;
    if (!signal.aborted) await reload();
  }, [fetchData, reload]);
  return { state, reload, revalidate, refreshing: refreshing === fetchData, refreshError: current?.error };
}
