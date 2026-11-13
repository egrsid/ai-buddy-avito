import { useEffect, useState } from 'react';

// Демо-переключатель состояний экрана: данные / загрузка / ошибка / пусто.
// Только для разработки на fixtures (RP-FE-01); с реальным API заменяется
// TanStack Query состояниями.

export type ViewState = 'data' | 'loading' | 'error' | 'empty';

export interface MockResult<T> {
  state: ViewState;
  data: T | undefined;
}

export function useMockData<T>(data: T, empty: T, view: ViewState): MockResult<T> {
  const [simLoading, setSimLoading] = useState(true);
  useEffect(() => {
    setSimLoading(true);
    const t = setTimeout(() => setSimLoading(false), 350);
    return () => clearTimeout(t);
  }, [view, data]);
  if (view === 'loading' || simLoading) return { state: 'loading', data: undefined };
  if (view === 'error') return { state: 'error', data: undefined };
  if (view === 'empty') return { state: 'empty', data: empty };
  return { state: 'data', data };
}
