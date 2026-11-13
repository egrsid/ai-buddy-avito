import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLiveData } from './live';

describe('useLiveData', () => {
  it('loading → data', async () => {
    const { result } = renderHook(() => useLiveData(async () => ['a'], [], [] as string[]));
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('data'));
    expect(result.current.data).toEqual(['a']);
  });

  it('пустой массив → empty', async () => {
    const { result } = renderHook(() => useLiveData(async () => [] as string[], [], []));
    await waitFor(() => expect(result.current.state).toBe('empty'));
  });

  it('ошибка fetcher → error с объектом ошибки', async () => {
    const boom = new Error('boom');
    const { result } = renderHook(() => useLiveData(async () => { throw boom; }, [], []));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toBe(boom);
  });

  it('keepPrevious: при перечитывании прежние данные остаются на экране', async () => {
    let n = 0;
    let release!: () => void;
    const fetcher = vi.fn(() => (++n === 1 ? Promise.resolve([1]) : new Promise<number[]>((r) => { release = () => r([1, 2]); })));
    const { result } = renderHook(() => useLiveData(fetcher, [], [] as number[], { keepPrevious: true }));
    await waitFor(() => expect(result.current.data).toEqual([1]));
    act(() => result.current.refetch());
    expect(result.current.state).toBe('data');
    expect(result.current.data).toEqual([1]);
    await act(async () => release());
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));
  });

  it('refetch перезапускает загрузку', async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ++n);
    const { result } = renderHook(() => useLiveData(fetcher, [], 0));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('enabled=false: не вызывает fetcher и остаётся в loading', async () => {
    const fetcher = vi.fn(async () => ['a']);
    const { result } = renderHook(() => useLiveData(fetcher, [], [] as string[], { enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.state).toBe('loading');
  });

  it('смена deps перезапускает загрузку', async () => {
    const fetcher = vi.fn(async (signal: AbortSignal) => 'x');
    const { result, rerender } = renderHook(({ dep }) => useLiveData(fetcher, [dep], ''), {
      initialProps: { dep: 1 },
    });
    await waitFor(() => expect(result.current.state).toBe('data'));
    rerender({ dep: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('abort при unmount не пишет состояние', async () => {
    let captured: AbortSignal | undefined;
    const fetcher = (signal: AbortSignal) => {
      captured = signal;
      return new Promise<string>(() => undefined);
    };
    const { unmount } = renderHook(() => useLiveData(fetcher, [], ''));
    unmount();
    expect(captured?.aborted).toBe(true);
  });
});
