import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewState } from './useMockData';

// RP-FE-02: live-загрузка данных из Go API без внешних зависимостей.
// Тот же контракт состояний, что у useMockData: loading/error/empty/data,
// плюс refetch для инвалидации после мутаций.

export interface LiveResult<T> {
  state: ViewState;
  data: T | undefined;
  error: unknown;
  refetch: () => void;
}

function isEmptyData<T>(data: T, empty: T): boolean {
  if (Array.isArray(data)) return data.length === 0;
  return Object.is(data, empty);
}

export function useLiveData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  empty: T,
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
): LiveResult<T> {
  const enabled = options.enabled ?? true;
  // keepPrevious: при обновлении показываем прежние данные, пока не придут новые
  // (чат не мигает и не сбрасывает прокрутку). Без него — честное состояние loading.
  const keepPrevious = options.keepPrevious ?? false;
  const [state, setState] = useState<{ status: ViewState; data: T | undefined; error: unknown }>({
    status: 'loading',
    data: undefined,
    error: undefined,
  });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((s) => (keepPrevious && s.data !== undefined ? s : { ...s, status: 'loading' }));
    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: isEmptyData(data, empty) ? 'empty' : 'data', data, error: undefined });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: undefined, error });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { state: enabled ? state.status : 'loading', data: state.data, error: state.error, refetch };
}
