import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { DataModeProvider, defaultMode, useDataMode } from './dataMode';
import { ApiError } from './api';

const { demoLoginMock, logoutMock, meMock } = vi.hoisted(() => ({
  demoLoginMock: vi.fn(),
  logoutMock: vi.fn(),
  meMock: vi.fn(),
}));

vi.mock('./endpoints', () => ({
  demoLogin: demoLoginMock,
  logout: logoutMock,
  me: meMock,
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
    meMock.mockReset().mockResolvedValue(session);
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

  it('без пресета — live по умолчанию; выбор fixtures в вкладке сохраняется', () => {
    vi.stubEnv('VITE_DATA_MODE', '');
    expect(defaultMode()).toBe('live');
    sessionStorage.setItem('buddy-data-mode', 'fixtures');
    expect(defaultMode()).toBe('fixtures');
    vi.stubEnv('VITE_DATA_MODE', 'live');
    expect(defaultMode()).toBe('live');
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

  it('не разрешает mount live-данных до завершения login', async () => {
    let finish!: (value: typeof session) => void;
    demoLoginMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useDataMode(), { wrapper });
    act(() => result.current.setMode('live'));
    expect(result.current.sessionReady).toBe(false);
    await act(async () => finish(session));
    expect(result.current.sessionReady).toBe(true);
    expect(sessionStorage.getItem('buddy-data-mode')).toBe('live');
  });

  it('demo preset открывает серверные данные даже при старом fixtures preference', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'live');
    sessionStorage.setItem('buddy-data-mode', 'fixtures');
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.mode).toBe('live');
    vi.unstubAllEnvs();
  });

  it('после reload восстанавливает реального пользователя через me без нового login', async () => {
    sessionStorage.setItem('buddy-data-mode', 'live');
    meMock.mockResolvedValue({ ...session, user: { ...session.user, account_id: 'buddy-a' } });
    const { result } = renderHook(() => useDataMode(), { wrapper });
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.accountId).toBe('buddy-a');
    expect(demoLoginMock).not.toHaveBeenCalled();
  });

  it('первый demo-вход после 401, ошибка сети не подменяется fixture-данными', async () => {
    sessionStorage.setItem('buddy-data-mode', 'live');
    meMock.mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'no session'));
    const first = renderHook(() => useDataMode(), { wrapper });
    await waitFor(() => expect(first.result.current.sessionReady).toBe(true));
    expect(demoLoginMock).toHaveBeenCalledWith('intern-a');
    first.unmount();
    demoLoginMock.mockClear();
    meMock.mockRejectedValueOnce(new Error('network'));
    const second = renderHook(() => useDataMode(), { wrapper });
    await waitFor(() => expect(second.result.current.sessionError).toBeTruthy());
    expect(second.result.current.sessionReady).toBe(false);
    expect(demoLoginMock).not.toHaveBeenCalled();
  });
});

it('production ignores a saved fixture mode and fixture build preset', () => {
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('VITE_DATA_MODE', 'fixtures');
  sessionStorage.setItem('buddy-data-mode', 'fixtures');
  expect(defaultMode()).toBe('live');
});
