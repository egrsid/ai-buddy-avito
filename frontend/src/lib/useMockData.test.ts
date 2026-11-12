import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMockData } from './useMockData';

describe('useMockData', () => {
  const data = ['a'];
  const empty: string[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('сначала имитирует загрузку, затем отдаёт данные', () => {
    const { result } = renderHook(() => useMockData(data, empty, 'data'));
    expect(result.current.state).toBe('loading');
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toEqual({ state: 'data', data: ['a'] });
  });

  it('view=error: ошибка после имитации загрузки', () => {
    const { result } = renderHook(() => useMockData(data, empty, 'error'));
    expect(result.current.state).toBe('loading');
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.state).toBe('error');
  });

  it('view=empty: пустые данные', () => {
    const { result } = renderHook(() => useMockData(data, empty, 'empty'));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toEqual({ state: 'empty', data: [] });
  });

  it('view=loading: остаётся в загрузке', () => {
    const { result } = renderHook(() => useMockData(data, empty, 'loading'));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state).toBe('loading');
  });

  it('смена view перезапускает имитацию загрузки', () => {
    const { result, rerender } = renderHook(({ view }) => useMockData(data, empty, view), {
      initialProps: { view: 'data' } as { view: 'data' | 'loading' | 'error' | 'empty' },
    });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.state).toBe('data');
    rerender({ view: 'empty' });
    expect(result.current.state).toBe('loading');
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.state).toBe('empty');
  });
});
