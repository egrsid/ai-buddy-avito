import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { DataModeProvider, useDataMode } from './dataMode';

const { demoLoginMock, logoutMock } = vi.hoisted(() => ({
  demoLoginMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock('./endpoints', () => ({
  demoLogin: demoLoginMock,
  logout: logoutMock,
}));

const session = {
  user: {
    id: '10000000-0000-4000-8000-000000000003',
    account_id: 'intern-a',
    display_name: 'Live Стажёр',
    roles: ['intern'],
    team_id: 'team-a',
    assignments: [],
    buddy_id: null,
  },
  csrf_token: 'a'.repeat(40),
};

function wrapper({ children }: { children: ReactNode }) {
  return <DataModeProvider>{children}</DataModeProvider>;
}

describe('DataMode', () => {
  beforeEach(() => {
    demoLoginMock.mockReset().mockResolvedValue(session);
    logoutMock.mockReset().mockResolvedValue(undefined);
  });

  it('без провайдера: безопасный fixtures-дефолт', () => {
    const { result } = renderHook(() => useDataMode());
    expect(result.current.mode).toBe('fixtures');
    expect(result.current.user.account_id).toBe('intern-a');
  });

  it('дефолт fixtures, смена аккаунта локальная', () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });
    expect(result.current.mode).toBe('fixtures');
    act(() => result.current.switchAccount('buddy-a'));
    expect(result.current.accountId).toBe('buddy-a');
    expect(result.current.user.account_id).toBe('buddy-a');
    expect(demoLoginMock).not.toHaveBeenCalled();
  });

  it('переход в live выполняет demo-login, пользователь из сессии', async () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await act(async () => result.current.setMode('live'));
    await waitFor(() => expect(demoLoginMock).toHaveBeenCalledWith('intern-a'));
    await waitFor(() => expect(result.current.user.display_name).toBe('Live Стажёр'));
    expect(result.current.sessionError).toBeNull();
  });

  it('в live смена аккаунта — повторный demo-login', async () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await act(async () => result.current.setMode('live'));
    await waitFor(() => expect(result.current.user.display_name).toBe('Live Стажёр'));
    await act(async () => result.current.switchAccount('buddy-a'));
    expect(demoLoginMock).toHaveBeenCalledWith('buddy-a');
  });

  it('ошибка входа → sessionError, режим остаётся live с fixture-пользователем', async () => {
    demoLoginMock.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await act(async () => result.current.setMode('live'));
    await waitFor(() => expect(result.current.sessionError).toMatch(/backend недоступен/));
    expect(result.current.user.account_id).toBe('intern-a');
  });

  it('возврат в fixtures вызывает logout', async () => {
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await act(async () => result.current.setMode('live'));
    await waitFor(() => expect(demoLoginMock).toHaveBeenCalled());
    act(() => result.current.setMode('fixtures'));
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});
