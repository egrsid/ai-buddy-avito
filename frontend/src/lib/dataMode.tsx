import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from './endpoints';
import { demoLogin, logout as apiLogout } from './endpoints';
import type { User } from '../fixtures/all-states';
import { users as fixtureUsers } from '../fixtures/all-states';

// RP-FE-02: источник данных приложения.
// fixtures — офлайн-демо на FE fixtures (поведение RP-FE-01);
// live — реальный Go API (cookie-сессия + CSRF через endpoints).
// Смена аккаунта в live выполняет demo-login (только local/test окружение Go).

export type DataMode = 'fixtures' | 'live';

interface DataModeValue {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
  /** Пользователь текущего аккаунта: fixture в fixtures-режиме, сессия в live. */
  user: User;
  accountId: string;
  switchAccount: (accountId: string) => Promise<void> | void;
  sessionError: string | null;
}

const DataModeContext = createContext<DataModeValue | null>(null);

export function DataModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>('fixtures');
  const [accountId, setAccountId] = useState('intern-a');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const loginAs = useCallback(async (id: string) => {
    setSessionError(null);
    try {
      setSession(await demoLogin(id));
      setAccountId(id);
    } catch {
      setSession(null);
      setSessionError('Не удалось войти в live-режим: backend недоступен или вход запрещён.');
    }
  }, []);

  const switchAccount = useCallback(
    (id: string) => {
      if (mode === 'live') return loginAs(id);
      setAccountId(id);
      return undefined;
    },
    [mode, loginAs],
  );

  const changeMode = useCallback(
    (next: DataMode) => {
      setMode(next);
      if (next === 'live') void loginAs(accountId);
      else void apiLogout().catch(() => undefined);
    },
    [accountId, loginAs],
  );

  const value = useMemo<DataModeValue>(() => {
    const user = mode === 'live' && session ? session.user : (fixtureUsers[accountId] ?? fixtureUsers['intern-a']);
    return {
      mode,
      setMode: changeMode,
      user: user as User,
      accountId,
      switchAccount,
      sessionError,
    };
  }, [mode, changeMode, session, accountId, switchAccount, sessionError]);

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode(): DataModeValue {
  const ctx = useContext(DataModeContext);
  if (!ctx) {
    // Страницы и компоненты тестируются без провайдера — безопасный дефолт fixtures.
    return {
      mode: 'fixtures',
      setMode: () => undefined,
      user: fixtureUsers['intern-a'],
      accountId: 'intern-a',
      switchAccount: () => undefined,
      sessionError: null,
    };
  }
  return ctx;
}
